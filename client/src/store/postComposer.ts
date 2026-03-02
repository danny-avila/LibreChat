import { atom } from 'recoil';

export type PostComposerState = {
  isOpen: boolean;
  initialContent?: string;
};

const postComposerState = atom<PostComposerState>({
  key: 'postComposerState',
  default: {
    isOpen: false,
    initialContent: '',
  },
});

export default postComposerState;
