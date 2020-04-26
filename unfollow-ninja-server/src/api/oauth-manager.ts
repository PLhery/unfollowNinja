import type { OAuth } from 'oauth';
import Dao from '../dao/dao';

export function getOauthUrl(client: OAuth, dao: Dao): Promise<string> {
    return new Promise((resolve, reject) => {
        client.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
            if (error) {
                reject(error);
            } else {
                dao.setTokenSecret(oauthToken, oauthTokenSecret)
                    .then(() => resolve('https://twitter.com/oauth/authenticate?oauth_token=' + oauthToken))
                    .catch(reject);
            }
        });
    });
}

type OAuthUser = Record<'token'|'secret'|'username'|'id', string>
export function getOauthUser(client: OAuth, token: string, secret: string, verifier: string): Promise<OAuthUser> {
    return new Promise((resolve, reject) => {
        client.getOAuthAccessToken(token, secret, verifier,
            (error, oauthAccessToken, oauthAccessTokenSecret) => {
                if (error) {
                    reject(error);
                    return;
                }
                client.get('https://api.twitter.com/1.1/account/verify_credentials.json?include_entities=false&skip_status=true',
                    oauthAccessToken, oauthAccessTokenSecret, (error2, data) => {
                        if (error2) {
                            reject(error2);
                            return;
                        }
                        const jsonData = JSON.parse(data.toString());
                        resolve({
                            token: oauthAccessToken,
                            secret: oauthAccessTokenSecret,
                            username: jsonData.screen_name,
                            id: jsonData.id_str,
                        });
                    });
            });
    });
}