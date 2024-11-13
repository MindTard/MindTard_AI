const ROLES = {
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    USER: 'user'
  };
  
  const DEFAULTS = {
    STOP_SEQUENCE: '***',
    MODEL_NICKNAME: 'assistant',
    FILLER_MESSAGE: {
      role: ROLES.USER,
      content: '_'
    }
  };
  
  export function stringifyTurns(turns) {
    return turns
      .map(turn => {
        switch (turn.role) {
          case ROLES.ASSISTANT:
            return `\nYour output:\n${turn.content}`;
          case ROLES.SYSTEM:
            return `\nSystem output: ${turn.content}`;
          default:
            return `\nUser input: ${turn.content}`;
        }
      })
      .join('')
      .trim();
  }
  
  export function toSinglePrompt(turns, system = null, stopSeq = DEFAULTS.STOP_SEQUENCE, modelNickname = DEFAULTS.MODEL_NICKNAME) {
    let prompt = system ? `${system}${stopSeq}` : '';
    
    const lastMessage = turns[turns.length - 1];
    const messages = turns.map(message => {
      const role = message.role === ROLES.ASSISTANT ? modelNickname : message.role;
      return `${role}: ${message.content}${stopSeq}`;
    });
  
    prompt += messages.join('');
  
    if (lastMessage?.role !== ROLES.ASSISTANT) {
      prompt += `${modelNickname}: `;
    }
  
    return prompt;
  }
  
  export function strictFormat(turns) {
    if (!turns.length) {
      return [DEFAULTS.FILLER_MESSAGE];
    }
  
    const messages = [];
    let prevRole = null;
  
    for (const message of turns) {
      const formattedMessage = {
        ...message,
        content: message.content.trim(),
        role: message.role === ROLES.SYSTEM ? ROLES.USER : message.role
      };
  
      if (message.role === ROLES.SYSTEM) {
        formattedMessage.content = `SYSTEM: ${formattedMessage.content}`;
      }
  
      if (message.role === prevRole) {
        if (message.role === ROLES.ASSISTANT) {
          messages.push(DEFAULTS.FILLER_MESSAGE, formattedMessage);
        } else {
          messages[messages.length - 1].content += '\n' + formattedMessage.content;
        }
      } else {
        messages.push(formattedMessage);
      }
  
      prevRole = message.role;
    }
  
    if (messages[0]?.role !== ROLES.USER) {
      messages.unshift(DEFAULTS.FILLER_MESSAGE);
    }
  
    return messages;
  }
  