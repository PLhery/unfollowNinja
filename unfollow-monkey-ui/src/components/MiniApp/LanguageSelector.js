import React from 'react';
import {Paragraph, Select} from "grommet";

import Styles from './LanguageSelector.module.scss';

import * as Flags from '../../images/flags'
import Link from "../Link";
import { Link as IconLink } from 'grommet-icons';


function LanguageSelector(props) {
  const LANGUAGES = [
	{label: 'English', code: 'en'},
	{label: 'French', code: 'fr'},
	{label: 'Spanish', code: 'es'},
	{label: 'Portuguese', code: 'pt'},
	{label: 'Indonesian', code: 'id'}
  ];

  const addYours = <span><Link href='https://hosted.weblate.org/projects/unfollow-monkey/notifications/'><IconLink size='small'/> Add yours</Link></span>

  const options = LANGUAGES.map((lang) =>
	<span className={Styles.element}><img alt={'flag-' + lang.code} className={Styles.flag} src={Flags[lang.code]}/> {lang.label}</span>);

  options.push(addYours);

  return <Paragraph>
	Receive your notifications in:
	<span className={Styles.languageSelector}>
		<Select
		  options={options}
		  size='medium'
		  value={options[LANGUAGES.findIndex((lang) => lang.code === props.value)]}
		  onChange={(e) => props.onChange(LANGUAGES[e.selected].code)}
		  disabled={[addYours]}
		>
		{(option) => option}
	  </Select>
	</span>
  </Paragraph>
}

export default LanguageSelector;