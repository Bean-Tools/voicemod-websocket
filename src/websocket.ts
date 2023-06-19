import { WebSocket } from 'ws';

// To avoid issues with similarly event type names, we
// import the types from ws prefixed with WS
import {
  ErrorEvent as WSErrorEvent,
  CloseEvent as WSCloseEvent,
  MessageEvent as WSMessageEvent,
} from 'ws';

import EventEmitter from 'eventemitter3';

import {
  MessageEvent,
  RegisterClientResponse,
  Voice,
  EventTypes,
  MapValueToArgsArray,
  SelectVoiceMode,
  LicenseType,
  Soundboard,
  Meme,
  Bitmap,
  LoadVoicePayload,
  VoiceParameterValue,
  VoiceState
} from './types';

const action_map: { [key: string]: keyof EventTypes } = {
  ConnectionOpened: 'ConnectionOpened',
  ConnectionClosed: 'ConnectionClosed',
  ConnectionError: 'ConnectionError',

  ClientRegistered: 'ClientRegistered',
  ClientRegistrationFailed: 'ClientRegistrationFailed',
  ClientRegistrationPending: 'ClientRegistrationPending',

  UserChanged: 'UserChanged',
  UserLicenseChanged: 'UserLicenseChanged',

  VoiceChanged: 'VoiceChanged',
  VoiceListChanged: 'VoiceListChanged',
  VoiceChangerStatusChanged: 'VoiceChangerStatusChanged',
  VoiceParameterChanged: 'VoiceParameterChanged',

  HearMyselfStatusChanged: 'HearMyselfStatusChanged',
  BackgroundEffectStatusChanged: 'BackgroundEffectStatusChanged',
  MuteMicStatusChanged: 'MuteMicStatusChanged',
  BadLanguageStatusChanged: 'BadLanguageStatusChanged',

  SoundboardListChanged: 'SoundboardListChanged',
  MemeListChanged: 'MemeListChanged',
};

/**
 * List of possible ports to connect to. These are necessary
 * because the Voicemod API does not have one single, fixed
 * port, but rather a range of ports where one *might* be open.
 *
 * Yeah. That look on your face? That's the same look I had.
 */
const possibleVoiceModPorts : number[] = [
  59129, 20000, 39273, 42152, 43782, 46667, 35679, 37170, 38501, 33952, 30546
];

const getVoiceModePort = async (host: string) : Promise<number> => {
  for (const port of possibleVoiceModPorts) {
    const isValidPort = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://${host}:${port}/v1`);

      ws.onopen = () => {
        ws.onopen = ws.onclose = ws.onerror = null;
        ws.close();
        resolve(true);
      };
      ws.onclose = () => {
        ws.onopen = ws.onclose = ws.onerror = null;
        resolve(false);
      };

      ws.onerror = () => {
        ws.onopen = ws.onclose = ws.onerror = null;
        resolve(false);
      };
    });

    if (isValidPort === true) {
      return port;
    }
  }

  throw new Error('unable to find valid Voicemod port');
};

/**
 * Voicemod WebSocket
 *
 * For further documentation, see:
 * https://control-api.voicemod.net/api-reference/
 *
 * This is a client to the Voicemod Control API.
 *
 * @class VoicemodWebSocket
 *
 * @example
 * const voicemod = new VoicemodWebSocket();
 * voicemod.connect("localhost", "aaaaaa-123456");
 *
 * voicemod.on("VoiceChanged", (voice: VoicemodVoice) => {
 *  console.log("Voice changed to", voice.friendlyName);
 * });
 *
 */
export default class VoicemodWebsocket extends EventEmitter<MapValueToArgsArray<EventTypes>> {
  private options : {
    host: string,
    clientKey: string,
    reconnect: boolean,
    timeout: number
  };

  private external_listeners: string[];
  private internal_events = new EventEmitter();

  private connected: boolean;

  private ws: WebSocket | null = null;

  private voicemodState : VoiceState = {};

  constructor(host: string, clientKey: string, reconnect = true, timeout = 5000) {
    super();

    this.options = {
      host,
      clientKey,
      reconnect,
      timeout
    };

    this.external_listeners = [];
    this.connected = false;
  }

  /**
   * Connect to the Voicemod API and authenticate
   *
   * This method must be called before any other methods and
   * will test a number of ports to find one that is available
   */
  async connect(): Promise<void> {
    if (this.connected === true) {
      return;
    }

    const port = await getVoiceModePort(this.options.host);

    this.ws = new WebSocket(`ws://${this.options.host}:${port}/v1`);

    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onerror = this.onError.bind(this);
    this.ws.onopen = this.onOpen.bind(this);
  }

  /**
   * Disconnect from the Voicemod API
   */
  disconnect(): void {
    if (this.connected === false || this.ws === null) {
      return;
    }

    this.ws.close();
    this.internal_events.removeAllListeners();

    this.emit('ConnectionClosed');

    return;
  }

  /**
   * Stop listening for any external event for the Voicemod API
   */
  clearListeners() {
    for (const event_name of this.external_listeners) {
      this.internal_events.removeAllListeners(event_name);
    }
  }

  /**
   * Listen for an event from the Voicemod API
   *
   * @param event_name The name of the event to listen for
   * @returns The event data
   */
  private internalEvent<ReturnVal = unknown>(event_id: string): Promise<ReturnVal> {
    return new Promise((resolve) => {
      this.internal_events.once(event_id, resolve);
    });
  }

  private onMessage(event: WSMessageEvent) {
    const data: MessageEvent = JSON.parse(event.data.toString());
    this.emit('AllEvents', data);

    if (data.msg && data.msg.toLowerCase() === 'pending authentication') {
      this.emit('ClientRegistrationPending');

    } else if (data.action && data.action === 'registerClient') {
      this.internal_events.emit(data.id, data);

    } else if (data.id || data.actionID) {
      // Events triggered by us
      this.emit(action_map[data.actionType], data.actionObject);
      this.internal_events.emit(data.id || data.actionID, data);

    } else if (data.action && data.action !== null && data.action.endsWith('Event')) {
      // Events triggered by the app
      if (data.action === 'voiceChangerEnabledEvent') {
        this.voicemodState.voiceChangerStatus = true;
        this.emit('VoiceChangerStatusChanged', true);

      } else if (data.action === 'voiceChangerDisabledEvent') {
        this.voicemodState.voiceChangerStatus = false;
        this.emit('VoiceChangerStatusChanged', false);

      } else if (data.action === 'backgroundEffectsEnabledEvent') {
        this.voicemodState.backgroundEffectsStatus = true;
        this.emit('BackgroundEffectStatusChanged', true);

      } else if (data.action === 'backgroundEffectsDisabledEvent') {
        this.voicemodState.backgroundEffectsStatus = false;
        this.emit('BackgroundEffectStatusChanged', false);

      } else if (data.action === 'hearMySelfEnabledEvent') {
        this.voicemodState.hearMyselfStatus = true;
        this.emit('HearMyselfStatusChanged', true);

      } else if (data.action === 'hearMySelfDisabledEvent') {
        this.voicemodState.hearMyselfStatus = false;
        this.emit('HearMyselfStatusChanged', false);

      } else if (data.action === 'muteMicEnabledEvent') {
        this.voicemodState.muteMicStatus = true;
        this.emit('MuteMicStatusChanged', true);

      } else if (data.action === 'muteMicDisabledEvent') {
        this.voicemodState.muteMicStatus = false;
        this.emit('MuteMicStatusChanged', false);

      } else if (data.action === 'muteMemeForMeEnabledEvent') {
        this.voicemodState.muteMemeForMeStatus = true;
        this.emit('MuteMemeForMeStatusChanged', true);

      } else if (data.action === 'muteMemeForMeDisabledEvent') {
        this.voicemodState.muteMemeForMeStatus = false;
        this.emit('MuteMemeForMeStatusChanged', false);

      } else if (data.action === 'voiceLoadedEvent') {
        this.onVoiceChange(data.actionObject.voiceID);

      } else if (data.action === 'badLanguageEnabledEvent') {
        this.emit('BadLanguageStatusChanged', true);

      } else if (data.action === 'badLanguageDisabledEvent') {
        this.emit('BadLanguageStatusChanged', false);

      } else {

        // TODO: Handle errrors more gracefully
        console.error('Unknown message: ', data);
        throw new Error('Unknown event: ' + data.action || data.actionID);
      }

    } else if (data.action && data.action !== null) {

      // List updates triggered by the app
      if (data.action === 'getAllSoundboard') {
        this.voicemodState.soundboards = data.actionObject.soundboards;
        this.emit('SoundboardListChanged', data.actionObject.soundboards);
      }

    } else {
      // TODO: Handle errrors more gracefully
      console.error('Unknown message: ', data);
      throw new Error('Unknown message: ' + data.action || data.actionID);
    }
  }

  /**
   * Sends a message to the Voicemod API WebSocket
   *
   * @param action  The name of the action
   * @param payload The payload to send
   * @returns       The event ID of the message
   */
  private wsSendMessage(action: string, payload: any = {}): string {
    if (this.ws === null || (this.connected === false && action !== 'registerClient')) {
      throw new Error('Not connected');
    }

    const event_id = Math.random().toString(36).substring(0, 16);
    this.ws.send(
      JSON.stringify({
        action,
        id: event_id,
        payload: payload,
      }),
    );

    return event_id;
  }

  /**
   * Sends a message to the Voicemod API WebSocket and waits for a response
   *
   * @param action The name of the action
   * @param payload The payload to send
   * @returns The response payload
   */
  private async wsGet(
    action: string,
    payload: any = {},
    settings: {
      walk?: boolean | string;
      storeAs?: keyof VoiceState;
      emit?: keyof EventTypes;
    } = {}
  ): Promise<any> {
    try {
      let result : any = await this.internalEvent(this.wsSendMessage(action, payload));

      if (settings.walk) {
        result = result.actionObject[settings.walk === true ? 'value' : settings.walk];
      }

      if (settings.storeAs) {
        this.voicemodState[settings.storeAs] = result;
      }

      if (settings.emit != null) {
        this.emit(settings.emit, result);
      }

      return result;

    } catch (error) {
      throw new Error('Could not get ' + action);
    }
  }

  private onClose(event: WSCloseEvent) {
    this.connected = false;
    this.onDisconnect();
    this.emit('ConnectionClosed');

    // TODO - Clear listeners
  }

  private onError(event: WSErrorEvent) {
    this.connected = false;
    this.onDisconnect();
    this.emit('ConnectionError', event);

    // TODO - Clear listeners
  }

  private async onOpen(): Promise<boolean> {
    this.emit('ConnectionOpened');

    try {
      await this.registerClient(this.options.clientKey);
      this.internal_events.emit('Connected');
      this.emit('Connected');
      return true;

    } catch {
      this.emit('ClientRegistrationFailed');
      this.internal_events.emit('Disconnected');
      return false;
    }
  }

  private onDisconnect() {
    this.emit('Disconnected');
    this.ws = null;
    this.connected = false;

    if (this.options.reconnect) {
      setTimeout(() => {
        this.connect();
      }, this.options.timeout || 5000);
    }
  }

  /**
   * Authenticates the client against the Voicemod API
   *
   * @param clientKey The API key for the Control API
   */
  private async registerClient(clientKey: string): Promise<RegisterClientResponse> {
    try {
      const reply = await this.wsGet('registerClient', {
        clientKey: clientKey
      });

      if (reply && parseInt(reply.payload.status.code) === 200) {
        this.connected = true;
        this.emit('ClientRegistered', reply);

      } else {
        this.onDisconnect();
        this.emit('ClientRegistrationFailed');
      }

      return reply;

    } catch {
      this.onDisconnect();
      this.emit('ClientRegistrationFailed');
      throw new Error("Couldn't register client");
    }
  }

  /**
   * Returns the user ID of the currently logged in user
   *
   * @returns Promise<string>
   */
  async getUser(): Promise<string> {
    if (this.voicemodState.user != null) {
      return this.voicemodState.user;
    }

    return await this.wsGet('getUser', {}, {
      walk: "userId",
      storeAs: "user",
      emit: "UserChanged"
    });
  }

  /**
   * Requests user license information.
   */
  async getUserLicense(): Promise<LicenseType> {
    if (this.voicemodState.userLicense != null) {
      return this.voicemodState.userLicense;
    }

    return await this.wsGet('getUserLicense', {}, {
      walk: 'licenseType',
      storeAs: 'userLicense',
      emit: 'UserLicenseChanged'
    });
  }

  /**
   * Requests the remaining time (in seconds) before a refresh is
   * made to the selection of voices that are available under the free version.
   */
  async getRotatoryVoicesRemainingTime(): Promise<number> {
    return await this.wsGet('getRotatoryVoicesRemainingTime', {}, { walk: 'remainingTime'})
  }

  /**
   * Requests the list of the available voices and the current
   * voice selected in the app for the current user.
   */
  async getVoices(): Promise<Voice[]> {
    return await this.wsGet('getVoices', {}, {
      walk: 'voices',
      storeAs: 'voiceList',
      emit: 'VoiceListChanged'
    });
  }

  /**
   * Requests the voice that is currently selected in the app.
   */
  async getCurrentVoice(): Promise<Voice> {
    if (this.voicemodState.currentVoice != null) {
      return await this.getVoiceFromId(this.voicemodState.currentVoice);
    }

    const result = await this.wsGet('getCurrentVoice', {}, {
      walk: 'voiceID',
      storeAs: 'currentVoice'
    });

    const voice = await this.getVoiceFromId(result);
    this.emit('VoiceChanged', voice);

    return voice;
  }

  /**
   * Requests all soundboards from the app with info for each
   * soundboard and each sound that is enabled based on the
   * current user's license.
   */
  async getAllSoundboard(): Promise<Soundboard[]> {
    if (this.voicemodState.soundboards != null) {
      return this.voicemodState.soundboards;
    }

    try {

      return await this.wsGet('getAllSoundboard', {}, {
        walk: 'soundboards',
        storeAs: 'soundboards',
        emit: 'SoundboardListChanged'
      });

    } catch {
      return [];
    }
  }

  /**
   * This message is triggered in response to a change in of a currently
   * active soundboard.
   */
  async getActiveSoundboardProfile(): Promise<Soundboard> {
    if (this.voicemodState.activeSoundboard != null) {
      return await this.getSoundboardFromId(this.voicemodState.activeSoundboard);
    }

    await this.getAllSoundboard();

    const result = await this.wsGet('getActiveSoundboardProfile', {}, { walk: 'profileId' });
    const activeSoundboard = await this.getSoundboardFromId(result);

    if (activeSoundboard) {
      this.voicemodState.activeSoundboard = activeSoundboard.id;
      return activeSoundboard;

    } else {
      throw new Error('Could not find active soundboard');
    }
  }

  /**
   * This message is triggered in response to a change in available meme
   * sounds (the user has added or removed a meme), and in response to
   * a getMemes message.
   */
  async getMemes(): Promise<Meme[]> {
    if (this.voicemodState.memes != null) {
      return this.voicemodState.memes;
    }

    return await this.wsGet('getMemes', {}, {
      walk: 'memes',
      storeAs: 'memes',
      emit: 'MemeListChanged'
    });
  }

  /**
   * Requests the icon for a given voice or meme.
   *
   * @param id The ID of the bitmap to get
   */
  async getBitmap(id: string, type: 'voice' | 'meme'): Promise<Bitmap> {
    let payload;
    if (type === 'voice') {
      payload = { voiceID: id };
    } else if (type === 'meme') {
      payload = { memeID: id };
    } else {
      throw new Error('Invalid type');
    }
    return await this.wsGet('getBitmap', payload);
  }

  /**
   * Requests a change to the user's selected voice
   *
   * @param voiceID The ID of the voice to change to
   * @param parameterName The name of the parameter to change
   * @param parameterValue The value of the parameter to change
   */
  async loadVoice(
    voiceID: string,
    parameterName: string | null = null,
    parameterValue: string | null = null,
  ): Promise<void> {
    let payload: LoadVoicePayload = {
      voiceID: voiceID,
    };

    if (parameterName !== null && parameterValue !== null) {
      payload = {
        ...payload,
        parameterName: parameterName,
        parameterValue: parameterValue,
      };
    }

    await this.wsGet('loadVoice', payload);
    return await this.onVoiceChange(voiceID);
  }
  setVoice = this.loadVoice;

  /**
   * Requests a change to a randomly selected voice
   *
   * @param mode Mode to use when selecting a voice
   */
  async selectRandomVoice(mode: SelectVoiceMode | null = null): Promise<void> {
    await this.wsGet('selectRandomVoice', { mode: mode });
  }

  /**
   * Requests the current status of the "Hear my voice" button in the app.
   */
  async getHearMyselfStatus(): Promise<boolean> {
    if (this.voicemodState.hearMyselfStatus != null) {
      return this.voicemodState.hearMyselfStatus;
    }

    return await this.wsGet('getHearMyselfStatus', {}, {
      walk: true,
      storeAs: 'hearMyselfStatus',
      emit: 'HearMyselfStatusChanged'
    });
  }

  /**
   * Requests a toggle of the "Hear my voice" button in the app.
   *
   * @param state The new status of the button
   */
  async toggleHearMyVoice(state: boolean): Promise<boolean> {
    return await this.wsGet('toggleHearMyVoid', { value: state }, {
      walk: true,
      storeAs: 'hearMyselfStatus',
      emit: 'HearMyselfStatusChanged'
    });
  }

  /**
   * Requests the current state of the "Voice Changer" button in the app.
   */
  async getVoiceChangerStatus(): Promise<boolean> {
    if (this.voicemodState.voiceChangerStatus != null) {
      return this.voicemodState.voiceChangerStatus;
    }

    return await this.wsGet('getVoiceChangerStatus', {}, {
      walk: true,
      storeAs: 'voiceChangerStatus',
      emit: 'VoiceChangerStatusChanged'
    });
  }

  /**
   * Requests a toggle of the "Voice Changer" button in the app.
   *
   * @param state The new status of the button
   */
  async toggleVoiceChanger(state: boolean): Promise<boolean> {
    return await this.wsGet('toggleVoiceChanger', { value: state }, {
      walk: true,
      storeAs: 'voiceChangerStatus',
      emit: 'VoiceChangerStatusChanged'
    });
  }

  /**
   * Requests the current state of the "Background Effects" button in the app.
   */
  async getBackgroundEffectsStatus(): Promise<boolean> {
    if (this.voicemodState.backgroundEffectsStatus != null) {
      return this.voicemodState.backgroundEffectsStatus;
    }

    return await this.wsGet('getBackgroundEffectStatus', {}, {
      walk: true,
      storeAs: 'backgroundEffectsStatus',
      emit: 'BackgroundEffectStatusChanged'
    });
  }

  /**
   * Requests a toggle of the "Background Effects" button in the app.
   */
  async toggleBackgroundEffects(): Promise<boolean> {
    return await this.wsGet('toggleBackgroundEffects', {}, {
      walk: true,
      storeAs: 'backgroundEffectsStatus',
      emit: 'BackgroundEffectStatusChanged'
    });
  }

  /**
   * Requests the current state of the "Mute" button in the app.
   */
  async getMuteMicStatus(): Promise<boolean> {
    if (this.voicemodState.muteMicStatus != null) {
      return this.voicemodState.muteMicStatus;
    }

    return await this.wsGet('getMuteMicStatus', {}, {
      walk: true,
      storeAs: 'muteMicStatus',
      emit: 'MuteMicStatusChanged'
    });
  }

  /**
   * Requests a toggle of the "Mute" button in the app.
   */
  async toggleMuteMic(): Promise<void> {
    return await this.wsGet('toggleMuteMic', {}, {
      walk: true,
      storeAs: 'muteMicStatus',
      emit: 'MuteMicStatusChanged'
    });
  }

  /**
   * Requests a state change of the "beep" sound that is normally actioned by the user to censor
   * something he or she is saying.
   *
   * @param state The new status of the button
   */
  async setBeepSound(state: boolean): Promise<void> {
    await this.wsGet('setBeepSound', {
      payload: {
        badLanguage: state === true ? 1 : 0,
      },
    });
  }

  /**
   * Requests playback of a meme sound.
   *
   * @param filename The file name of the sound we want to play
   * @param isKeyDown True if sending a KeyDown action
   */
  async playMeme(filename: string, isKeyDown: boolean = true): Promise<void> {
    await this.wsGet('playMeme', {
      payload: {
        filename: filename,
        isKeyDown: isKeyDown,
      },
    });
  }

  /**
   * Requests playback stop of all meme sounds currently playing.
   */
  async stopMemes(): Promise<void> {
    return await this.wsGet('stopAllMemeSounds', {});
  }

  /**
   * Requests the current status of the "Mute for me" button in the app (Soundboard menu).
   */
  async getMuteMemeForMeStatus(): Promise<boolean> {
    if (this.voicemodState.muteMemeForMeStatus != null) {
      return this.voicemodState.muteMemeForMeStatus;
    }

    return await this.wsGet('getMuteMemeForMeStatus', {}, {
      walk: true,
      storeAs: 'muteMemeForMeStatus',
      emit: 'MuteMemeForMeStatusChanged'
    });
  }

  /**
   * Requests a toggle of the "Mute for me" button in the app (Soundboard menu).
   */
  async toggleMuteMemeForMe(): Promise<boolean> {
    return await this.wsGet('toggleMuteMemeForMe', {}, {
      walk: true,
      storeAs: 'muteMemeForMeStatus',
      emit: 'MuteMemeForMeStatusChanged'
    });
  }

  /**
   * Requests a change of parameter for currently selected voice.
   *
   * @param parameterName The name of the parameter to change
   * @param parameterValue The value(s) of the parameter to change
   */
  async setCurrentVoiceParameter(
    parameterName: string,
    parameterValue: VoiceParameterValue,
  ): Promise<void> {
    const reply = await this.wsGet('setCurrentVoiceParameter', {
      parameterName: parameterName,
      parameterValue: parameterValue,
    });
    this.emit('VoiceParameterChanged', reply.actionObject);
  }

  /**
   * @param id The voice id of the voice to change to
   */
  private async onVoiceChange(id: string) {
    this.voicemodState.currentVoice = id;
    this.emit('VoiceChanged', await this.getVoiceFromId(id));
  }

  /**
   * Gets a voice from the voice list by ID
   *
   * @param id The voice ID of the voice to get
   */
  private async getVoiceFromId(id: string): Promise<Voice> {

    // We always need to have a current voice list - if we don't, we might
    // run into issues where we try to get a voice that doesn't exist in cache (yet)
    const voices = await this.getVoices();
    if (voices == null) {
      throw new Error('No voices found');
    }

    this.voicemodState.voiceList = voices;
    return this.voicemodState.voiceList.filter(voice => voice.id === id)[0];
  }

  /**
   * Gets a soundboard from the soundboard list by ID
   *
   * @param soundboard_id The ID of the soundboard to get
   */
  private async getSoundboardFromId(soundboard_id: string): Promise<Soundboard> {
    const soundboards = await this.getAllSoundboard();
    if (soundboards == null) {
      throw new Error('No soundboards found');
    }
    this.voicemodState.soundboards = soundboards;

    return soundboards.filter((soundboard) => soundboard.id === soundboard_id)[0];
  }
}
