import { useState, useEffect } from 'react';
import Alaska from './alaska.jpg';
import AlaskaWebp from './alaska.webp';

export {default as Dog} from './dog.svg'
export {default as Logo}from './logo.svg';
export {default as DmScreenshot} from './dmscreenshot.png'
export {default as Affinitweet} from './affinitweet.png'
export {default as Uzzy} from './uzzy.svg'
export {default as UnfollowNinja} from './unfollowninja.svg'
export {default as UnfollowMonkeyHands} from './unfollowmonkey-hands.svg'
export {default as applePay} from './apple-pay.svg'
export {default as googlePay} from './google-pay.svg'
export {default as mastercard} from './mastercard.svg'

export function useAlaska() { // react hook to get the right alaska image url
    const [supportsWebP, setWebP] = useState(null); // true if supports, otherwise false
    useEffect(() => {
        const img = new window.Image();
        img.onload = () => setWebP((img.width > 0) && (img.height > 0));
        img.onerror = () => setWebP(false);
        img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    }, []);
    if (supportsWebP === true) {
        return AlaskaWebp;
    } else if (supportsWebP === false) {
        return Alaska;
    } else {
        return null;
    }
}

