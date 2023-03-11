import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSubmitting: false,
  stopStream: false,
  disabled: false,
  model: 'chatgpt',
  promptPrefix: '',
  chatGptLabel: '',
  customModel: null
};

const currentSlice = createSlice({
  name: 'submit',
  initialState,
  reducers: {
    setSubmitState: (state, action) => {
      state.isSubmitting = action.payload;
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
    setCustomGpt: (state, action) => {
      state.promptPrefix = action.payload.promptPrefix;
      state.chatGptLabel = action.payload.chatGptLabel;
    },
    setCustomModel: (state, action) => {
      state.customModel = action.payload;
    }
  }
});

export const { setSubmitState, setStopStream, setDisabled, setModel, setCustomGpt, setCustomModel } =
  currentSlice.actions;

export default currentSlice.reducer;
