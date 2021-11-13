import React from 'react';
import Styles from './Emojis.module.scss';

import ImgWavingHand from './1f44b.png';
import ImgSeeNoEvil from './1f648.png';
import ImgNoEntry from './26d4.png';
import ImgPoo from './1f4a9.png';
import ImgBrokenHeart from './1f494.png';

const EmoImg = ({alt, src}) => <img draggable="false" className={Styles.emoji} alt={alt} src={src}/>;
export const WavingHand = () => <EmoImg alt="👋" src={ImgWavingHand}/>;
export const SeeNoEvil = () => <EmoImg alt="🙈" src={ImgSeeNoEvil}/>;
export const NoEntry = () => <EmoImg alt="⛔" src={ImgNoEntry}/>;
export const Poo = () => <EmoImg alt="💩" src={ImgPoo}/>;
export const BrokenHeart = () => <EmoImg alt="💔" src={ImgBrokenHeart}/>;

const Emojis = { WavingHand, SeeNoEvil, NoEntry, Poo, BrokenHeart };
export default Emojis;