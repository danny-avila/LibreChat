export default function resetConvo(messages, sender) {
    if (messages.length === 0) {
        return false;
    }
    const modelMessages = messages.filter((message) => !message.isCreatedByUser);
    const lastModel = modelMessages[modelMessages.length - 1].sender;
    if (lastModel !== sender) {
        console.log('Model change! Resetting convo. Original messages: ', messages, 'filtered messages: ', modelMessages, 'last model: ', lastModel, 'sender: ', sender);
        return true;
    }
    return false;
}
