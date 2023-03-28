import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSubmitting: false,
  submission: {},
  stopStream: false,
  disabled: true,
  model: 'chatgpt',
  promptPrefix: null,
  chatGptLabel: null,
  customModel: null,
  cursor: true,
};

const currentSlice = createSlice({
  name: 'submit',
  initialState,
  reducers: {
    setSubmitState: (state, action) => {
      state.isSubmitting = action.payload;
    },
    setSubmission: (state, action) => {
      state.submission = action.payload;
      if (Object.keys(action.payload).length === 0) {
        state.isSubmitting = false;
      }
    },
    setStopStream: (state, action) => {
      state.stopStream = action.payload;
    },
    setDisabled: (state, action) => {
      state.disabled = action.payload;
    },
    setModel: (state, action) => {
      state.model = action.payload;
    },
    toggleCursor: (state, action) => {
      if (action.payload) {
        state.cursor = action.payload;
      } else {
        state.cursor = !state.cursor;
      }
    },
    setCustomGpt: (state, action) => {
      state.promptPrefix = action.payload.promptPrefix;
      state.chatGptLabel = action.payload.chatGptLabel;
    },
    setCustomModel: (state, action) => {
      state.customModel = action.payload;
    }
  }
});

export const { toggleCursor, setSubmitState, setSubmission, setStopStream, setDisabled, setModel, setCustomGpt, setCustomModel } =
  currentSlice.actions;

export default currentSlice.reducer;
