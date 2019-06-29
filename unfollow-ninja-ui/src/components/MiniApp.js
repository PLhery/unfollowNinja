import React from 'react';
import {Box, Button} from "grommet/es6";
import {Twitter, ChatOption, UserExpert} from "grommet-icons";

export default (props) => (
    <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
      <Button
          icon={<Twitter color='white'/>}
          label='Connectez-vous à votre compte'
          primary={true}
          style={{color: 'white'}}
      />
      <Button
          icon={<ChatOption/>}
          label='Choisissez le compte qui vous enverra vos DMs'
          disabled={true}
      />
      <Button
          icon={<UserExpert/>}
          label={'Suivez @UnfollowNinja'}
          disabled={true}
      />
    </Box>
);