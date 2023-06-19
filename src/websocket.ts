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
  ResponseGetVoices,
  ResponseGetCurrentVoice,
  ResponseMuteMicStatus,
  MapValueToArgsArray,
  SelectVoiceMode,
  ResponseGetUser,
  LicenseType,
  ResponseGetUserLicense,
  ResponseGetRotatoryVoicesRemainingTime,
  ResponseGetAllSoundboard,
  Soundboard,
  ResponseGetActiveSoundboard,
  Meme,
  ResponseGetMemes,
  Bitmap,
  ResponseToggleHearMyself,
  ResponseToggleVoiceChanger,
  ResponseSetCurrentVoiceParameter,
  LoadVoicePayload,
  VoiceParameterValue,
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
  private ws: WebSocket | null = null;
  private api_host: string;
  private api_port: number;
  private client_key: string;
  private external_listeners: string[];
  private internal_events = new EventEmitter();
  private connected: boolean;

  private reconnect: boolean;
  private reconnect_timeout: number;

  private current_voice: null | string = null;
  private voiceList: null | Voice[] = null;

  private user: null | string = null;
  private user_license: null | LicenseType = null;

  private soundboards: null | Soundboard[] = null;
  private active_soundboard: null | string = null;

  private memes: null | Meme[] = null;

  private hear_myself_status: null | boolean = null;
  private voice_changer_status: null | boolean = null;
  private background_effects_status: null | boolean = null;
  private mute_meme_for_me_status: null | boolean = null;
  private mute_mic_status: null | boolean = null;

  constructor(api_host: string, client_key: string, reconnect = true, reconnect_timeout = 5000) {
    super();

    this.api_host = api_host;
    this.client_key = client_key;
    this.api_port = 0;
    this.reconnect = reconnect;
    this.reconnect_timeout = reconnect_timeout;

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

    this.api_port = await getVoiceModePort(this.api_host);

    this.ws = new WebSocket(`ws://${this.api_host}:${this.api_port}/v1`);

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
   * @param event_name string The name of the event to listen for
   * @returns Promise<any> The event data
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
        this.voice_changer_status = true;
        this.emit('VoiceChangerStatusChanged', true);
      } else if (data.action === 'voiceChangerDisabledEvent') {
        this.voice_changer_status = false;
        this.emit('VoiceChangerStatusChanged', false);
      } else if (data.action === 'backgroundEffectsEnabledEvent') {
        this.background_effects_status = true;
        this.emit('BackgroundEffectStatusChanged', true);
      } else if (data.action === 'backgroundEffectsDisabledEvent') {
        this.background_effects_status = false;
        this.emit('BackgroundEffectStatusChanged', false);
      } else if (data.action === 'hearMySelfEnabledEvent') {
        this.hear_myself_status = true;
        this.emit('HearMyselfStatusChanged', true);
      } else if (data.action === 'hearMySelfDisabledEvent') {
        this.hear_myself_status = false;
        this.emit('HearMyselfStatusChanged', false);
      } else if (data.action === 'muteMicEnabledEvent') {
        this.emit('MuteMicStatusChanged', true);
        this.mute_mic_status = true;
      } else if (data.action === 'muteMicDisabledEvent') {
        this.mute_mic_status = false;
        this.emit('MuteMicStatusChanged', false);
      } else if (data.action === 'muteMemeForMeEnabledEvent') {
        this.mute_meme_for_me_status = true;
        this.emit('MuteMemeForMeStatusChanged', true);
      } else if (data.action === 'muteMemeForMeDisabledEvent') {
        this.mute_meme_for_me_status = false;
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
        this.soundboards = data.actionObject.soundboards;
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
   * @param action  string  The name of the action
   * @param payload any     The payload to send
   * @returns string        The event ID of the message
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
   * @param action string The name of the action
   * @param payload any The payload to send
   * @returns Promise<any> The response payload
   */
  private async wsGet(action: string, payload: any = {}): Promise<any> {
    try {
      return await this.internalEvent(this.wsSendMessage(action, payload));
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

  private onOpen(): Promise<boolean> {
    this.emit('ConnectionOpened');

    return this.registerClient(this.client_key)
      .then((register) => {
        this.internal_events.emit('Connected');
        this.emit('Connected');
        return true;
      })
      .catch((error) => {
        this.emit('ClientRegistrationFailed');
        this.internal_events.emit('Disconnected');
        return false;
      });
  }

  private onDisconnect() {
    this.emit('Disconnected');
    this.ws = null;
    this.connected = false;

    if (this.reconnect) {
      setTimeout(() => {
        this.connect();
      }, this.reconnect_timeout);
    }
  }

  /**
   * Authenticates the client against the Voicemod API
   *
   * @param clientKey string The API key for the Control API
   * @returns Promise<VoicemodRegisterClientResponse>
   * @private
   */
  private async registerClient(clientKey: string): Promise<RegisterClientResponse> {
    try {
      const registerResponse = await this.wsGet('registerClient', {
        clientKey: clientKey
      });

      if (registerResponse && parseInt(registerResponse.payload.status.code) === 200) {
        this.connected = true;
        this.emit('ClientRegistered', registerResponse);

      } else {
        this.onDisconnect();
        this.emit('ClientRegistrationFailed');
      }

      return registerResponse;

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
    if (this.user !== null) {
      return this.user;
    }

    const userResponse = await this.wsGet('getUser', {});
    this.user = userResponse.actionObject.userId;
    this.emit('UserChanged', userResponse.actionObject.userId);
    return userResponse.actionObject.userId;
  }

  /**
   * Requests user license information.
   */
  async getUserLicense(): Promise<LicenseType> {
    if (this.user_license !== null) {
      return this.user_license;
    }

    const userLicenseResponse = await this.wsGet('getUserLicense', {});
    this.user_license = userLicenseResponse.actionObject.licenseType;
    this.emit('UserLicenseChanged', userLicenseResponse.actionObject.licenseType);

    return userLicenseResponse.actionObject.licenseType;
  }

  /**
   * Requests the remaining time (in seconds) before a refresh is
   * made to the selection of voices that are available under the free version.
   */
  async getRotatoryVoicesRemainingTime(): Promise<number> {
    const getRotatoryVoicesRemainingTimeResponse = await this.wsGet('getRotatoryVoicesRemainingTime', {});
    return getRotatoryVoicesRemainingTimeResponse.actionObject.remainingTime;
  }

  /**
   * Requests the list of the available voices and the current
   * voice selected in the app for the current user.
   */
  async getVoices(): Promise<Voice[]> {
    const getVoicesResponse = await this.wsGet('getVoices', {});
    this.voiceList = getVoicesResponse.actionObject.voices;
    this.emit('VoiceListChanged', getVoicesResponse.actionObject.voices);

    return getVoicesResponse.actionObject.voices;
  }

  /**
   * Requests the voice that is currently selected in the app.
   */
  async getCurrentVoice(): Promise<Voice> {
    if (this.current_voice !== null) {
      return await this.getVoiceFromID(this.current_voice);
    }
    const getCurrentVoiceResponse = await this.wsGet('getCurrentVoice', {});
    const voiceId = getCurrentVoiceResponse.actionObject.voiceID;
    this.current_voice = voiceId;

    const voice = await this.getVoiceFromID(voiceId);
    this.emit('VoiceChanged', voice);

    return voice;
  }

  /**
   * Requests all soundboards from the app with info for each
   * soundboard and each sound that is enabled based on the
   * current user's license.
   */
  async getAllSoundboard(): Promise<Soundboard[]> {
    if (this.soundboards !== null) {
      return this.soundboards;
    }

    try {
      const getAllSoundBoardResponse = await this.wsGet('getAllSoundboard', {});
      this.soundboards = getAllSoundBoardResponse.actionObject.soundboards;
      this.emit('SoundboardListChanged', getAllSoundBoardResponse.actionObject.soundboards);

      return getAllSoundBoardResponse.actionObject.soundboards;

    } catch {
      return [];
    }
  }

  /**
   * This message is triggered in response to a change in of a currently
   * active soundboard.
   */
  async getActiveSoundboardProfile(): Promise<Soundboard> {
    if (this.active_soundboard != null) {
      return await this.getSoundboardFromID(this.active_soundboard);
    }

    const soundboards = await this.getAllSoundboard();
    this.soundboards = soundboards;

    const getActiveSoundboardProfileResponse = await this.wsGet('getActiveSoundboardProfile', {});

    const activeSoundboard = await this.getSoundboardFromID(
      getActiveSoundboardProfileResponse.actionObject.profileId,
    );

    if (activeSoundboard) {
      this.active_soundboard = activeSoundboard.id;
      return activeSoundboard;
    } else {
      throw new Error('Could not find active soundboard');
    }
  }

  /**
   * This message is triggered in response to a change in available meme
   * sounds (the user has added or removed a meme), and in response to
   * a getMemes message.
   *
   * @returns Promise<VoicemodMeme[]>
   */
  getMemes(): Promise<Meme[]> {
    if (this.memes !== null) {
      return Promise.resolve(this.memes);
    }

    return this.wsGet('getMemes', {}).then((memes: ResponseGetMemes) => {
      this.memes = memes.actionObject.memes;
      this.emit('MemeListChanged', memes.actionObject.memes);
      return memes.actionObject.memes;
    });
  }

  /**
   * Requests the icon for a given voice or meme.
   *
   * @param id string The ID of the bitmap to get
   * @returns Promise<VoicemodBitmap>
   */
  getBitmap(id: string, type: 'voice' | 'meme'): Promise<Bitmap> {
    let payload;
    if (type === 'voice') {
      payload = { voiceID: id };
    } else if (type === 'meme') {
      payload = { memeID: id };
    } else {
      return Promise.reject('Invalid type');
    }
    return this.wsGet('getBitmap', payload).then((bitmap: Bitmap) => {
      return bitmap;
    });
  }

  /**
   * Requests a change to the user's selected voice
   *
   * @param voiceID string The ID of the voice to change to
   * @param parameterName string The name of the parameter to change
   * @param parameterValue string The value of the parameter to change
   * @returns Promise<void>
   */
  loadVoice(
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

    return this.wsGet('loadVoice', payload).then(async (response) => {
      return this.onVoiceChange(voiceID);
    });
  }

  setVoice = this.loadVoice;

  /**
   * Requests a change to a randomly selected voice
   *
   * @param mode VoicemodSelectVoiceMode Mode to use when selecting a voice
   */
  selectRandomVoice(mode: SelectVoiceMode | null = null): Promise<void> {
    return this.wsGet('selectRandomVoice', {
      mode: mode,
    });
  }

  /**
   * Requests the current status of the "Hear my voice" button in the app.
   *
   * @returns Promise<boolean>
   */
  getHearMyselfStatus(): Promise<boolean> {
    if (this.hear_myself_status !== null) {
      return Promise.resolve(this.hear_myself_status);
    }

    return this.wsGet('getHearMyselfStatus', {}).then((status) => {
      this.hear_myself_status = status.actionObject.value;
      this.emit('HearMyselfStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests a toggle of the "Hear my voice" button in the app.
   *
   * @param state boolean The new status of the button
   * @returns Promise<boolean>
   */
  toggleHearMyVoice(state: boolean): Promise<boolean> {
    return this.wsGet('toggleHearMyVoice', {
      value: state,
    }).then((status: ResponseToggleHearMyself) => {
      this.hear_myself_status = status.actionObject.value;
      this.emit('HearMyselfStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests the current state of the "Voice Changer" button in the app.
   *
   * @returns Promise<boolean>
   */
  getVoiceChangerStatus(): Promise<boolean> {
    if (this.voice_changer_status !== null) {
      return Promise.resolve(this.voice_changer_status);
    }

    return this.wsGet('getVoiceChangerStatus', {}).then((status) => {
      this.voice_changer_status = status.actionObject.value;
      this.emit('VoiceChangerStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests a toggle of the "Voice Changer" button in the app.
   *
   * @param state boolean The new status of the button
   */
  toggleVoiceChanger(state: boolean): Promise<boolean> {
    return this.wsGet('toggleVoiceChanger', {
      value: state,
    }).then((status: ResponseToggleVoiceChanger) => {
      this.voice_changer_status = status.actionObject.value;
      this.emit('VoiceChangerStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests the current state of the "Background Effects" button in the app.
   *
   * @returns Promise<boolean>
   */
  getBackgroundEffectsStatus(): Promise<boolean> {
    if (this.background_effects_status !== null) {
      return Promise.resolve(this.background_effects_status);
    }

    return this.wsGet('getBackgroundEffectStatus', {}).then((status) => {
      this.background_effects_status = status.actionObject.value;
      this.emit('BackgroundEffectStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests a toggle of the "Background Effects" button in the app.
   *
   * @returns Promise<boolean>
   */
  async toggleBackgroundEffects(): Promise<boolean> {
    return this.wsGet('toggleBackgroundEffects', {}).then((status) => {
      this.background_effects_status = status.actionObject.value;
      this.emit('BackgroundEffectStatusChanged', status.actionObject.value);

      return status.actionObject.value;
    });
  }

  /**
   * Requests the current state of the "Mute" button in the app.
   *
   * @returns Promise<boolean>
   */
  getMuteMicStatus(): Promise<boolean> {
    if (this.mute_mic_status !== null) {
      return Promise.resolve(this.mute_mic_status);
    }

    return this.wsGet('getMuteMicStatus', {}).then((status: ResponseMuteMicStatus) => {
      this.mute_mic_status = status.actionObject.value;
      this.emit('MuteMicStatusChanged', status.actionObject.value);
      return status.actionObject.value;
    });
  }

  /**
   * Requests a toggle of the "Mute" button in the app.
   *
   * @returns Promise<boolean>
   */
  toggleMuteMic(): Promise<void> {
    return this.wsGet('toggleMuteMic', {}).then((status: ResponseMuteMicStatus) => {
      this.mute_mic_status = status.actionObject.value;
      this.emit('MuteMicStatusChanged', status.actionObject.value);
    });
  }

  /**
   * Requests a state change of the "beep" sound that is normally actioned by the user to censor
   * something he or she is saying.
   *
   * @param state boolean The new status of the button
   * @returns Promise<boolean>
   */
  setBeepSound(state: boolean): Promise<void> {
    return this.wsGet('setBeepSound', {
      payload: {
        badLanguage: state === true ? 1 : 0,
      },
    });
  }

  /**
   * Requests playback of a meme sound.
   *
   * @param filename string The file name of the sound we want to play
   * @param isKeyDown boolean True if sending a KeyDown action
   */
  playMeme(filename: string, isKeyDown: boolean = true): Promise<void> {
    return this.wsGet('playMeme', {
      payload: {
        filename: filename,
        isKeyDown: isKeyDown,
      },
    });
  }

  /**
   * Requests playback stop of all meme sounds currently playing.
   *
   * @returns Promise<boolean>
   */
  stopMemes(): Promise<void> {
    return this.wsGet('stopAllMemeSounds', {});
  }

  /**
   * Requests the current status of the "Mute for me" button in the app (Soundboard menu).
   *
   * @returns Promise<boolean>
   */
  getMuteMemeForMeStatus(): Promise<boolean> {
    if (this.mute_meme_for_me_status !== null) {
      return Promise.resolve(this.mute_meme_for_me_status);
    }

    return this.wsGet('getMuteMemeForMeStatus', {}).then((mute: ResponseMuteMicStatus) => {
      this.mute_meme_for_me_status = mute.actionObject.value;

      this.emit('MuteMemeForMeStatusChanged', mute.actionObject.value);

      return mute.actionObject.value;
    });
  }

  /**
   * Requests a toggle of the "Mute for me" button in the app (Soundboard menu).
   *
   * @returns Promise<boolean>
   */
  toggleMuteMemeForMe(): Promise<boolean> {
    return this.wsGet('toggleMuteMemeForMe', {}).then((mute: ResponseMuteMicStatus) => {
      this.mute_meme_for_me_status = mute.actionObject.value;

      this.emit('MuteMemeForMeStatusChanged', mute.actionObject.value);

      return mute.actionObject.value;
    });
  }

  /**
   * Requests a change of parameter for currently selected voice.
   *
   * @param parameterName string The name of the parameter to change
   * @param parameterValue {} The value(s) of the parameter to change
   * @returns Promise<void>
   */
  setCurrentVoiceParameter(
    parameterName: string,
    parameterValue: VoiceParameterValue,
  ): Promise<void> {
    return this.wsGet('setCurrentVoiceParameter', {
      parameterName: parameterName,
      parameterValue: parameterValue,
    }).then((response: ResponseSetCurrentVoiceParameter) => {
      this.emit('VoiceParameterChanged', response.actionObject);
    });
  }

  /**
   * @param voice_id string The ID of the voice to change to
   */
  private async onVoiceChange(voice_id: string) {
    this.current_voice = voice_id;
    this.emit('VoiceChanged', await this.getVoiceFromID(voice_id));
  }

  /**
   * Gets a voice from the voice list by ID
   *
   * @param voice_id string The ID of the voice to get
   * @returns Promise<VoicemodVoice>
   */
  private getVoiceFromID(voice_id: string): Promise<Voice> {
    // We always need to have a current voice list - if we don't, we might
    // run into issues where we try to get a voice that doesn't exist in cache (yet)

    return this.getVoices().then((voices) => {
      if (voices === null) {
        throw new Error('No voices found');
      }
      this.voiceList = voices;

      return this.voiceList.filter((voice) => voice.id === voice_id)[0];
    });
  }

  /**
   * Gets a soundboard from the soundboard list by ID
   *
   * @param soundboard_id string The ID of the soundboard to get
   * @returns Promise<VoicemodSoundboard>
   */
  private getSoundboardFromID(soundboard_id: string): Promise<Soundboard> {
    return this.getAllSoundboard().then((soundboards) => {
      if (soundboards === null) {
        throw new Error('No soundboards found');
      }
      this.soundboards = soundboards;

      return soundboards.filter((soundboard) => soundboard.id === soundboard_id)[0];
    });
  }
}
