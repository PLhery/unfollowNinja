import { RequestHandler, Router } from 'express';
import * as passport from 'passport';
import Dao from '../dao/dao';

const router = Router();
export default router;

const shouldBeLoggedIn: RequestHandler = (req, res, next) => {
    if (!req.session.passport || !req.session.passport.user) {
        res.status(400);
        return res.json({error: 'you must be logged in to access this endpoint'});
    }
    next();
};

const dao = new Dao();

router.get('/', (req, res) => res.json({message: 'Unfollow ninja API is up!'}));

router.get('/auth',  passport.authenticate('twitter'), (req, res) => {
    res.redirect('/v1/infos');
});

router.get('/infos', shouldBeLoggedIn, (req, res) => {
    const { username, id, photo, dmId, dmPhoto } = req.user;
    if (dmId) {
        dao.getCachedUsername(dmId).then((dmUsername) => {
            res.json( { username, id, photo, dmId, dmUsername, dmPhoto });
        });
    } else {
        res.json( { username, id, photo });
    }
});

router.get('/auth-dm-app', shouldBeLoggedIn, passport.authenticate('twitter-dm', { session: false }), (req, res) => {
    res.redirect('/v1/infos');
});
