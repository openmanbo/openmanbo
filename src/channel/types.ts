/**
 * Channel abstraction for connecting the agent to messaging platforms.
 *
 * Inspired by the openclaw channel architecture, each channel implementation
 * receives inbound messages from a platform, routes them through the Agent,
 * and sends the response back.
 */

/** Metadata describing a channel. */
export interface ChannelMeta {
  /** Unique channel identifier (e.g. "discord", "slack"). */
  id: string;
  /** Human-readable label (e.g. "Discord"). */
  label: string;
}

/** Inbound message from a channel. */
export interface InboundMessage {
  /** Platform-specific sender identifier. */
  senderId: string;
  /** Display name of the sender. */
  senderName: string;
  /** The text content of the message. */
  content: string;
  /** Platform-specific channel / conversation identifier. */
  channelId: string;
}

/** The interface every channel must implement. */
export interface Channel {
  /** Metadata about this channel. */
  readonly meta: ChannelMeta;

  /**
   * Start listening for inbound messages.
   * The implementation should connect to the platform and begin processing messages.
   */
  start(): Promise<void>;

  /**
   * Gracefully shut down the channel.
   */
  stop(): Promise<void>;
}
