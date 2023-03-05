import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSubmitting: false,
  disabled: false,
  model: 'chatgpt',
  promptPrefix: '',
  chatGptLabel: '',
};

const currentSlice = createSlice({
  name: 'submit',
  initialState,
  reducers: {
    setSubmitState: (state, action) => {
      state.isSubmitting = action.payload;
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
  }
});

export const { setSubmitState, setDisabled, setModel, setCustomGpt } = currentSlice.actions;

export default currentSlice.reducer;
