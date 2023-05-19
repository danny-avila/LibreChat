import {
  atom,
} from 'recoil';

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
