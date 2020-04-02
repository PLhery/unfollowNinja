import {RequestHandler, Router} from 'express';
import kue from 'kue';
import passport from 'passport';
import { promisify } from 'util';
import Dao, {UserCategory} from '../dao/dao';
import {IUserEgg} from '../utils/types';

const router = Router();
export default router;

const AUTH_REDIRECT = process.env.AUTH_REDIRECT || 'http://localhost:8080/';

const shouldBeLoggedIn: RequestHandler = (req, res, next) => {
    if (!req.session.passport || !req.session.passport.user) {
        res.status(400);
        return res.json({error: 'you must be logged in to access this endpoint'});
    }
    next();
};

const dao = new Dao();
const queue = kue.createQueue({redis: process.env.REDIS_KUE_URI});

router.get('/', (req, res) => res.json({message: 'Unfollow ninja API is up!'}));

router.get('/auth',  passport.authenticate('twitter'), (req, res) => {
    res.redirect(AUTH_REDIRECT);
});

router.get('/infos', shouldBeLoggedIn, (req, res) => {
    const { username, id, photo, dmId, dmPhoto } = req.user as IUserEgg;
    if (dmId) {
        dao.getCachedUsername(dmId).then((dmUsername) => {
            res.json( { username, id, photo, dmId, dmUsername, dmPhoto });
        });
    } else {
        res.json( { username, id, photo });
    }
});

router.get('/auth-dm-app', shouldBeLoggedIn, passport.authenticate('twitter-dm', { session: false }), (req, res) => {
    const { username, id, photo, token, tokenSecret } = req.user as IUserEgg;
    Promise.all([
        dao.getUserDao(req.session.passport.user.id).setUserParams({
            dmId: id,
            dmPhoto: photo,
            dmToken: token,
            dmTokenSecret: tokenSecret,
        }),
        dao.getUserDao(req.session.passport.user.id).setCategory(UserCategory.enabled),
        dao.addTwittoToCache({id, username}),
    ]).then(
        () => promisify((cb) =>
            queue
                .create('sendWelcomeMessage', {
                    title: `send welcome message to @${username}`,
                    userId: req.session.passport.user.id,
                    username,
                })
                .removeOnComplete(true)
                .save(cb),
        )(),
    ).then(() => res.redirect(AUTH_REDIRECT));
});

router.get('/remove-dm-app', shouldBeLoggedIn, (req, res) => {
    Promise.all([
        dao.getUserDao(req.session.passport.user.id).setCategory(UserCategory.disabled),
        dao.getUserDao(req.session.passport.user.id).setUserParams({
            dmId: null,
            dmPhoto: null,
            dmToken: null,
            dmTokenSecret: null,
        }),
    ]).then(() => res.redirect('/v1/infos'));
});
