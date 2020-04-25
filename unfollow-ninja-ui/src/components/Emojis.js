import React from 'react';
import Styles from './Emojis.module.scss';

const EmoImg = ({alt, src}) => <img draggable="false" className={Styles.emoji} alt={alt} src={src}/>;
export const WavingHand = () => <EmoImg alt="👋" src="https://twemoji.maxcdn.com/v/12.1.5/svg/1f44b.svg"/>;
export const SeeNoEvil = () => <EmoImg alt="🙈" src="https://twemoji.maxcdn.com/v/12.1.5/svg/1f648.svg"/>;
export const NoEntry = () => <EmoImg alt="⛔" src="https://twemoji.maxcdn.com/v/12.1.5/svg/26d4.svg"/>;
export const Poo = () => <EmoImg alt="💩" src="https://twemoji.maxcdn.com/v/12.1.5/svg/1f4a9.svg"/>;
export const BrokenHeart = () => <EmoImg alt="💔" src="https://twemoji.maxcdn.com/v/12.1.5/svg/1f494.svg"/>;

export default {WavingHand, SeeNoEvil, NoEntry, Poo, BrokenHeart}