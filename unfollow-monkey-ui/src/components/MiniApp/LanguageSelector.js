import React from 'react';
import {Paragraph, Select} from "grommet";

import Styles from './LanguageSelector.module.scss';

import * as Flags from '../../images/flags'


function LanguageSelector(props) {
  const LANGUAGES = [
	{label: 'English', code: 'en'},
	{label: 'French', code: 'fr'},
	{label: 'Spanish', code: 'es'},
	{label: 'Portuguese', code: 'pt'}
  ];

  const options = LANGUAGES.map((lang) =>
	<span className={Styles.element}><img alt={'flag-' + lang.code} className={Styles.flag} src={Flags[lang.code]}/> {lang.label}</span>);

  return <Paragraph>
	Receive your notifications in:
	<span className={Styles.languageSelector}>
		<Select
		  options={options}
		  size='medium'
		  value={options[LANGUAGES.findIndex((lang) => lang.code === props.value)]}
		  onChange={(e) => props.onChange(LANGUAGES[e.selected].code)}
		>
		{(option) => option}
	  </Select>
	</span>
  </Paragraph>
}

export default LanguageSelector;