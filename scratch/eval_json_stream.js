// Test parser
const parseEvent = (parsed, messages) => {
    let lastMsg = messages[messages.length - 1];
    
    // Look for text fragments
    const textFragment = parsed.text || parsed.content || (parsed.delta && parsed.delta.text) || (typeof parsed === 'string' ? parsed : null);
    
    if (textFragment) {
        if (!lastMsg || lastMsg.role !== 'assistant') {
            messages.push({ role: 'assistant', content: textFragment });
        } else {
            lastMsg.content += textFragment;
        }
    }
}
