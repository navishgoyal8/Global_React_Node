import React from 'react';
import './ChatMessage.css';

const ChatMessage = ({ type, text, time, nameTag, isReply }) => {
  // Applies standard colors, but adds an "is-reply" class if it's the 2nd message
  const messageClass = `chat-block ${type} ${isReply ? 'is-reply' : ''}`;

  return (
    <div className={messageClass}>
      <div className="message-content">
        {nameTag && <span className="message-name">{nameTag}</span>}
        <span className="message-text">{text}</span>
      </div>
      
      <div className="message-time">
        {time} {type === 'outgoing' && <span className="read-ticks">✓✓</span>}
      </div>
    </div>
  );
};

export default ChatMessage;