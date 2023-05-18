import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState
} from 'recoil';
import buildTree from '~/utils/buildTree';

// current submission
// submit any new value to this state will cause new message to be send.
// set to null to give up any submission
// {
//   conversation, // target submission, must have: model, chatGptLabel, promptPrefix
//   messages, // old messages
//   message, // request message
//   initialResponse, // response message
//   isRegenerate=false, // isRegenerate?
// }

const submission = atom({
  key: 'submission',
  default: null
});

const isSubmitting = atom({
  key: 'isSubmitting',
  default: false
});

export default {
  submission,
  isSubmitting
};
