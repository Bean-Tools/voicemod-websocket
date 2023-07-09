// To avoid issues with similarly event type names, we
// import the types from ws prefixed with WS
import {
  WebSocket,
  type ErrorEvent as WSErrorEvent,
  type CloseEvent as WSCloseEvent,
  type MessageEvent as WSMessageEvent,
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
  VoiceState,
} from './types';

import actionMap from './util/action-map';
import getVoicemodPort from './util/get-voicemod-port';

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
 * voicemod.connect("localhost", "aaaaaa-123456", true, 500, 50);
 *
 * voicemod.on("VoiceChanged", (voice: VoicemodVoice) => {
 *  console.log("Voice changed to", voice.friendlyName);
 * });
 *
 */
export default class VoicemodWebsocket extends EventEmitter<MapValueToArgsArray<EventTypes>> {
  private options: {
    host: string;
    clientKey: string;
    reconnect: boolean;
    timeout: number;
    maxRetries: number;
  };

  private internalEvents = new EventEmitter();

  private connected: boolean = false;

  private ws: WebSocket | null = null;

  private voicemodState: VoiceState = {};

  private forceDisconnect: boolean = false;

  private currentRetry: number = 1;

  constructor(host: string, clientKey: string, reconnect = false, timeout = 1000, maxRetries = 5) {
    super();

    this.options = {
      host,
      clientKey,
      reconnect,
      timeout,
      maxRetries: maxRetries,
    };
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

    return await getVoicemodPort(this.options.host)
      .then((port) => {
        this.ws = new WebSocket(`ws://${this.options.host}:${port}/v1`);

        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onclose = this.onClose.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.ws.onopen = this.onOpen.bind(this);
      })
      .catch((e) => {
        if (this.options.reconnect && this.forceDisconnect !== true) {
          if (this.options.maxRetries !== 0 && this.currentRetry >= this.options.maxRetries) {
            this.emit('ConnectionError', e);
            throw new Error('Could not connect to Voicemod API');
          }

          this.currentRetry = this.currentRetry + 1;

          setTimeout(() => {
            this.emit('ConnectionRetry');
            this.connect();
          }, this.options.timeout);
        } else {
          this.emit('ConnectionError', e);
        }
      });
  }

  /**
   * Disconnect from the Voicemod API
   */
  disconnect(): void {
    if (this.connected !== false && this.ws !== null) {
      this.forceDisconnect = true;
      this.ws.close();
      this.internalEvents.removeAllListeners();

      this.emit('ConnectionClosed');
    }
  }

  /**
   * Listen for an event from the Voicemod API
   *
   * @param id The name of the event to listen for
   * @returns The event data
   */
  private internalEvent<ReturnVal = unknown>(id: string): Promise<ReturnVal> {
    return new Promise((resolve) => {
      this.internalEvents.once(id, resolve);
    });
  }

  private onMessage(event: WSMessageEvent) {
    const data: MessageEvent = JSON.parse(event.data.toString());
    this.emit('AllEvents', data);

    if (data.msg && data.msg.toLowerCase() === 'pending authentication') {
      this.emit('ClientRegistrationPending');
    } else if (data.action && data.action === 'registerClient') {
      this.internalEvents.emit(data.id, data);
    } else if (data.id || data.actionID) {
      // Events triggered by us
      this.emit(actionMap[data.actionType], data.actionObject);
      this.internalEvents.emit(data.id || data.actionID, data);
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
        throw new Error(
          'Unknown event: ' + data.action ||
            data.actionID + ' If you see this, please report it to the developer.',
        );
      }
    } else if (data.action && data.action !== null) {
      // List updates triggered by the app
      if (data.action === 'getAllSoundboard') {
        this.voicemodState.soundboards = data.actionObject.soundboards;
        this.emit('SoundboardListChanged', data.actionObject.soundboards);
      }
    } else {
      throw new Error(
        'Unknown message: ' + JSON.stringify(data.action) || JSON.stringify(data.actionID),
      );
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

    const id = Math.random().toString(36).substring(0, 16);
    this.ws.send(
      JSON.stringify({
        action,
        id: id,
        payload: payload,
      }),
    );

    return id;
  }

  /**
   * Sends a message to the Voicemod API WebSocket and waits for a response
   *
   * @param action The name of the action
   * @param payload The payload to send
   * @param settings.walk
   * @param settings.storeAs The name of the internal property to store the response as
   * @param settings.emit The name of the event to emit when the response is received
   * @returns The response payload
   */
  private async wsGet(
    action: string,
    payload: any = {},
    settings: {
      walk?: boolean | string;
      storeAs?: keyof VoiceState;
      emit?: keyof EventTypes;
    } = {},
  ): Promise<any> {
    try {
      let result: any = await this.internalEvent(this.wsSendMessage(action, payload));

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
      throw new Error(`Could not get ${action}`);
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
      this.internalEvents.emit('Connected');
      this.emit('Connected');
      return true;
    } catch {
      this.emit('ClientRegistrationFailed');
      this.internalEvents.emit('Disconnected');
      return false;
    }
  }

  private onDisconnect() {
    this.emit('Disconnected');
    this.ws = null;
    this.connected = false;

    if (this.options.reconnect && this.forceDisconnect !== true) {
      // First retry immediately, then let the retry logic inside connect()
      // handle the rest. We still emit the event here so it's clear that
      // the connection was lost and we are retrying.
      this.emit('ConnectionRetry');
      this.connect();
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
        clientKey: clientKey,
      });

      if (reply && parseInt(reply.payload.status.code) === 200) {
        this.connected = true;
        this.emit('ClientRegistered', reply);
      } else {
        this.onDisconnect();
        this.emit('ClientRegistrationFailed');
      }

      this.currentRetry = 0;

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

    return this.wsGet(
      'getUser',
      {},
      {
        walk: 'userId',
        storeAs: 'user',
        emit: 'UserChanged',
      },
    );
  }

  /**
   * Requests user license information.
   */
  async getUserLicense(): Promise<LicenseType> {
    if (this.voicemodState.userLicense != null) {
      return this.voicemodState.userLicense;
    }

    return this.wsGet(
      'getUserLicense',
      {},
      {
        walk: 'licenseType',
        storeAs: 'userLicense',
        emit: 'UserLicenseChanged',
      },
    );
  }

  /**
   * Requests the remaining time (in seconds) before a refresh is
   * made to the selection of voices that are available under the free version.
   */
  async getRotatoryVoicesRemainingTime(): Promise<number> {
    return this.wsGet('getRotatoryVoicesRemainingTime', {}, { walk: 'remainingTime' });
  }

  /**
   * Requests the list of the available voices and the current
   * voice selected in the app for the current user.
   */
  async getVoices(): Promise<Voice[]> {
    return this.wsGet(
      'getVoices',
      {},
      {
        walk: 'voices',
        storeAs: 'voiceList',
        emit: 'VoiceListChanged',
      },
    );
  }

  /**
   * Requests the voice that is currently selected in the app.
   */
  async getCurrentVoice(): Promise<Voice> {
    if (this.voicemodState.currentVoice != null) {
      return this.getVoiceFromId(this.voicemodState.currentVoice);
    }

    const result = await this.wsGet(
      'getCurrentVoice',
      {},
      {
        walk: 'voiceID',
        storeAs: 'currentVoice',
      },
    );

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
      return this.wsGet(
        'getAllSoundboard',
        {},
        {
          walk: 'soundboards',
          storeAs: 'soundboards',
          emit: 'SoundboardListChanged',
        },
      );
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
      return this.getSoundboardFromId(this.voicemodState.activeSoundboard);
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

    return this.wsGet(
      'getMemes',
      {},
      {
        walk: 'memes',
        storeAs: 'memes',
        emit: 'MemeListChanged',
      },
    );
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
    return this.wsGet('getBitmap', payload);
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
    return this.onVoiceChange(voiceID);
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

    return this.wsGet(
      'getHearMyselfStatus',
      {},
      {
        walk: true,
        storeAs: 'hearMyselfStatus',
        emit: 'HearMyselfStatusChanged',
      },
    );
  }

  /**
   * Requests a toggle of the "Hear my voice" button in the app.
   *
   * @param state The new status of the button
   */
  async toggleHearMyVoice(state: boolean): Promise<boolean> {
    return this.wsGet(
      'toggleHearMyVoice',
      { value: state },
      {
        walk: true,
        storeAs: 'hearMyselfStatus',
        emit: 'HearMyselfStatusChanged',
      },
    );
  }

  /**
   * Requests the current state of the "Voice Changer" button in the app.
   */
  async getVoiceChangerStatus(): Promise<boolean> {
    if (this.voicemodState.voiceChangerStatus != null) {
      return this.voicemodState.voiceChangerStatus;
    }

    return this.wsGet(
      'getVoiceChangerStatus',
      {},
      {
        walk: true,
        storeAs: 'voiceChangerStatus',
        emit: 'VoiceChangerStatusChanged',
      },
    );
  }

  /**
   * Requests a toggle of the "Voice Changer" button in the app.
   *
   * @param state The new status of the button
   */
  async toggleVoiceChanger(state: boolean): Promise<boolean> {
    return this.wsGet(
      'toggleVoiceChanger',
      { value: state },
      {
        walk: true,
        storeAs: 'voiceChangerStatus',
        emit: 'VoiceChangerStatusChanged',
      },
    );
  }

  /**
   * Requests the current state of the "Background Effects" button in the app.
   */
  async getBackgroundEffectsStatus(): Promise<boolean> {
    if (this.voicemodState.backgroundEffectsStatus != null) {
      return this.voicemodState.backgroundEffectsStatus;
    }

    return this.wsGet(
      'getBackgroundEffectStatus',
      {},
      {
        walk: true,
        storeAs: 'backgroundEffectsStatus',
        emit: 'BackgroundEffectStatusChanged',
      },
    );
  }

  /**
   * Requests a toggle of the "Background Effects" button in the app.
   */
  async toggleBackgroundEffects(): Promise<boolean> {
    return this.wsGet(
      'toggleBackgroundEffects',
      {},
      {
        walk: true,
        storeAs: 'backgroundEffectsStatus',
        emit: 'BackgroundEffectStatusChanged',
      },
    );
  }

  /**
   * Requests the current state of the "Mute" button in the app.
   */
  async getMuteMicStatus(): Promise<boolean> {
    if (this.voicemodState.muteMicStatus != null) {
      return this.voicemodState.muteMicStatus;
    }

    return this.wsGet(
      'getMuteMicStatus',
      {},
      {
        walk: true,
        storeAs: 'muteMicStatus',
        emit: 'MuteMicStatusChanged',
      },
    );
  }

  /**
   * Requests a toggle of the "Mute" button in the app.
   */
  async toggleMuteMic(): Promise<void> {
    return this.wsGet(
      'toggleMuteMic',
      {},
      {
        walk: true,
        storeAs: 'muteMicStatus',
        emit: 'MuteMicStatusChanged',
      },
    );
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
    return this.wsGet('stopAllMemeSounds', {});
  }

  /**
   * Requests the current status of the "Mute for me" button in the app (Soundboard menu).
   */
  async getMuteMemeForMeStatus(): Promise<boolean> {
    if (this.voicemodState.muteMemeForMeStatus != null) {
      return this.voicemodState.muteMemeForMeStatus;
    }

    return this.wsGet(
      'getMuteMemeForMeStatus',
      {},
      {
        walk: true,
        storeAs: 'muteMemeForMeStatus',
        emit: 'MuteMemeForMeStatusChanged',
      },
    );
  }

  /**
   * Requests a toggle of the "Mute for me" button in the app (Soundboard menu).
   */
  async toggleMuteMemeForMe(): Promise<boolean> {
    return this.wsGet(
      'toggleMuteMemeForMe',
      {},
      {
        walk: true,
        storeAs: 'muteMemeForMeStatus',
        emit: 'MuteMemeForMeStatusChanged',
      },
    );
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
    return this.voicemodState.voiceList.filter((voice) => voice.id === id)[0];
  }

  /**
   * Gets a soundboard from the soundboard list by ID
   *
   * @param id The ID of the soundboard to get
   */
  private async getSoundboardFromId(id: string): Promise<Soundboard> {
    const soundboards = await this.getAllSoundboard();
    if (soundboards == null) {
      throw new Error('No soundboards found');
    }
    this.voicemodState.soundboards = soundboards;

    return soundboards.filter((soundboard) => soundboard.id === id)[0];
  }
}
