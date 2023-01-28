import React from 'react';
import {Paragraph, Select} from "grommet";

import Styles from './LanguageSelector.module.scss';

import * as Flags from '../../images/flags'
import Link from "../Link";
import { Link as IconLink } from 'grommet-icons';


function LanguageSelector(props) {
  const LANGUAGES = [
    {label: 'Arabic', code: 'ar'},
	{label: 'Chinese', code: 'zh_Hans'},
	{label: 'Dutch', code: 'nl'},
	{label: 'English', code: 'en'},
	{label: 'French', code: 'fr'},
	{label: 'German', code: 'de'},
	{label: 'Indonesian', code: 'id'},
	{label: 'Polish', code: 'pl'},
  	{label: 'Portuguese', code: 'pt'},
    {label: 'Portug (br)', code: 'pt_BR'},
	{label: 'Spanish', code: 'es'},
	{label: 'Thai', code: 'th'},
	{label: 'Turkish', code: 'tr'},
	{label: 'Ukrainian', code: 'uk'},
	{label: 'Tamazight', code: 'zgh'},
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
