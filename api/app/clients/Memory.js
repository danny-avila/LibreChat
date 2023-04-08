import { BaseMemory } from 'langchain';
import { Conversation, Message } from './models'; // Assuming you have Conversation and Message models defined

class CustomMemory extends BaseMemory {

  constructor(conversationId) {
    super();
    this.conversationId = conversationId;
    this.messages = [];
  }

  async loadMessagesFromDatabase() {
    const conversation = await Conversation.findOne({ _id: this.conversationId }).populate('messages');
    this.messages = conversation?.messages || [];
  }

  async loadMemoryVariables(values) {
    await this.loadMessagesFromDatabase();
    const memoryVariables = { inputs: [], outputs: [] };

    // Process messages and populate memory variables based on isCreatedByUser field
    this.messages.forEach((message) => {
      if (message.isCreatedByUser) {
        // Process input message
        // (Modify this part based on how you want to store input values in memory variables)
        memoryVariables.inputs.push(message.content);
      } else {
        // Process output message
        // (Modify this part based on how you want to store output values in memory variables)
        memoryVariables.outputs.push(message.content);
      }
    });

    return memoryVariables;
  }

  async saveContext(inputValues, outputValues){
    // Save input and output values to the database

    // Create and save input messages
    const inputMessages = inputValues.map((inputValue) => {
      return new Message({ content: inputValue, isCreatedByUser: true });
    });
    await Message.insertMany(inputMessages);

    // Create and save output messages
    const outputMessages = outputValues.map((outputValue) => {
      return new Message({ content: outputValue, isCreatedByUser: false });
    });
    await Message.insertMany(outputMessages);

    // Update the conversation document with new messages
    await Conversation.updateOne(
      { _id: this.conversationId },
      { $push: { messages: { $each: [...inputMessages, ...outputMessages] } } }
    );
  }
}
