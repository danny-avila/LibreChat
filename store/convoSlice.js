import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  active: false,
  conversationId: null,
  parentMessageId: null,
};

const currentSlice = createSlice({
  name: 'convo',
  initialState,
  reducers: {
    setConversation: (state, action) => {
      console.log('in setConversation reducer');
      const { conversationId, parentMessageId } = action.payload;
      state.conversationId = conversationId;
      state.parentMessageId = parentMessageId;
    },
  }
});
//

export const { setConversation } = currentSlice.actions;

export default currentSlice.reducer;
