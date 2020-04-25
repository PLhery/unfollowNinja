import React from 'react';
import { Box, Heading, Paragraph } from "grommet/es6";
import Emojis from './Emojis';
import Styles from './Faq.module.scss';

export default (props) => {
    return <Box alignSelf='center' pad='medium' margin='medium' className={Styles.container} {...props}>
            <Heading level={1} color='dark'>Foire aux questions</Heading>

            <Heading level={3} color='dark'>Un ami m'a unfollow mais je n'ai pas été prévenu</Heading>
            <Paragraph>Pour éviter de vous déranger trop souvent, plusieurs filtres s'appliquent sur les notifications envoyées. Pour être certain d'avoir la notification, la personne doit vous avoir suivie 24h et unfollow 20 minutes.</Paragraph>

            <Heading level={3} color='dark'>Publierez-vous des tweets sans mon accord ?</Heading>
            <Paragraph>Nous ne publierons jamais de tweet sans votre accord ! Seul le compte d'envoi de messages privés donne la permission d'envoi de tweets.
                Cela est dû au fonctionnement des permissions Twitter : il n'y a que 3 ensembles de permissions, et nous ne pouvons demander la permission d'envoi de DMs sans celle d'envoi de tweets.
                Vous pouvez créer un compte Twitter séparé dédié à l'envoi de ces messages si vous le souhaitez.</Paragraph>

            <Heading level={3} color='dark'>Pourquoi l'étape 2 demande tant de permissions ?</Heading>
            <Paragraph>Comme décrit précédemment, cela est dû au fonctionnement des permissions Twitter : il n'y a que 3 ensembles de permissions, et nous ne pouvons demander la permission d'envoi de DMs sans les autres.
                Jamais nous n'avons extrait ces jetons pour les utiliser autrement que dans le cadre de cette application open-source.
                Vous pouvez créer un compte Twitter séparé dédié à l'envoi de ces messages si vous le souhaitez, pour plus de sérénité. Une possibilité de notifications chrome est à l'étude :).</Paragraph>


            <Heading level={3} color='dark'>Que signifient les différents messages et emojis ?</Heading>
            <ul>
                <li>Les messages suivants parlent d'eux-meme :<ul>
                    <li><b>@username</b> vous a unfollow <Emojis.WavingHand/></li>
                    <li><b>@username</b> a été suspendu <Emojis.SeeNoEvil/></li>
                    <li><b>@username</b> vous a bloqué  <Emojis.NoEntry/></li>
                    <li>Vous avez bloqué <b>@username</b> <Emojis.Poo/></li>
                </ul></li>
                <li><b>@username</b> a quitté Twitter <Emojis.SeeNoEvil/> peut signifier que la personne a été suspendue quelques minutes, a fermé son compte, ou a été retirée de Twitter par exemple à cause de la limite d'âge.</li>
                <li>L'emoji est un coeur brisé <Emojis.BrokenHeart/> si cette personne est un mutual, que vous la suiviez.</li>
                <li>Si plus de 20 twittos vous unfollowent en moins de deux minutes, vous ne serez informé que des 20 premiers, ainsi que du nombre total de followers perdus.</li>
                <li>"Un twitto a quitté Twitter <Emojis.SeeNoEvil/>" : quand le nom d'utilisateur de la personne qui a fermé son compte n'a pas eu le temps d'être sauvegardé (peut prendre 48h), vous ne recevez pas son pseudo, mais êtes informé de cet abonné en moins.</li>
                <li>"Ce compte vous suivait avant votre inscription à <b>@unfollowninja</b> !" : nous n'arrivons pas toujours à retrouver la date de follow exacte de chaque unfollower. Si on ne la trouve pas, nous vous donnons la première fois que nous l'avons vu sur votre compte. Mais s'il était déjà sur votre compte lors de votre inscription, nous ne pouvons vous donner de date.</li>
            </ul>

            <Heading level={3} color='dark'>Pourquoi le service est-il gratuit ?</Heading>
            <Paragraph>Ce projet est maintenu sur mon temps libre, et me permet d'avoir un projet sur lequel je peux librement experimenter, en parallèle de mon travail. L'association Hivane Network permet au service d'exister à moindres frais grâce au prêt d'un serveur virtuel.</Paragraph>
        </Box>;
}