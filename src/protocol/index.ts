/**
 * Protocol Module — canonical message types for EndiorBot.
 *
 * @module protocol
 * @version 1.0.0
 * @sprint 94
 */

export {
  CHANNEL_SOURCES,
  type ChannelSource,
  type EndiorMessage,
  type EndiorRequest,
  type EndiorResponse,
  type EndiorResponseMeta,
} from "./types.js";

export {
  isValidChannelSource,
  isValidEndiorMessage,
  validateMessageContent,
  generateMessageId,
} from "./validators.js";

export {
  fromInboundMessage,
  fromOTTMessage,
  fromIncomingMessage,
  toInboundMessage,
  toInboundResponse,
} from "./converters.js";
