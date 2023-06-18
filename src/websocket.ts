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
  VoicemodMessageEvent,
  VoicemodRegisterClientResponse,
  VoicemodVoice,
  EventTypes,
  VoicemodResponseGetVoices,
  VoicemodResponseGetCurrentVoice,
  VoicemodResponseMuteMicStatus,
  MapValueToArgsArray,
  VoicemodSelectVoiceMode,
  VoicemodResponseGetUser,
  VoicemodLicenseType,
  VoicemodResponseGetUserLicense,
  VoicemodResponseGetRotatoryVoicesRemainingTime,
  VoicemodResponseGetAllSoundboard,
  VoicemodSoundboard,
  VoicemodResponseGetActiveSoundboard,
  VoicemodMeme,
  VoicemodResponseGetMemes,
  VoicemodBitmap,
  VoicemodResponseToggleHearMyself,
  VoicemodResponseToggleVoiceChanger,
  VoicemodresponseSetCurrentVoiceParameter,
  VoicemodLoadVoicePayload,
  VoicemodVoiceParameterValue,
} from './types';

/**
 * Voicemod WebSocket
 *
 * For further documentation, see:
 * https://control-api.voicemod.net/api-reference/
 *
 * This is a partial implementation of the Voicemod API
 * and is not complete. It is only intended to be used
 * for the purposes of this project.
 *
 * This class is not intended to be used directly, but
 * rather through the VoicemodService class.
 *
 * @class VoicemodWebSocket
 * @fires {connected} When the websocket connects
 * @fires {disconnected} When the websocket disconnects
 * @fires {voiceChange} When the voice changes
 * @fires {voiceListChange} When the list of voices changes
 * @fires {error} When an error occurs
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

  /**
   * List of possible ports to connect to. These are necessary
   * because the Voicemod API does not have one single, fixed
   * port, but rather a range of ports where one *might* be open.
   *
   * Yeah. That look on your face? That's the same look I had.
   *
   * @type {number[]}
   * @private
   */
  private possible_ports = [
    59129, 20000, 39273, 42152, 43782, 46667, 35679, 37170, 38501, 33952, 30546,
  ];

  private reconnect: boolean;
  private reconnect_timeout: number = 5000;

  private current_voice: null | string = null;
  private voiceList: null | VoicemodVoice[] = null;

  private user: null | string = null;
  private userLicense: null | VoicemodLicenseType = null;

  private soundboards: null | VoicemodSoundboard[] = null;
  private activeSoundboard: null | string = null;

  private memes: null | VoicemodMeme[] = null;

  private hear_myself_status: null | boolean = null;
  private voice_changer_status: null | boolean = null;
  private background_effects_status: null | boolean = null;
  private mute_meme_for_me_status: null | boolean = null;
  private mute_mic_status: null | boolean = null;

  private action_map: { [key: string]: keyof EventTypes } = {
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

  constructor(api_host: string, client_key: string, reconnect = true) {
    super();

    this.api_host = api_host;
    this.client_key = client_key;
    this.api_port = 0;
    this.reconnect = reconnect;

    this.external_listeners = [];
    this.connected = false;
  }

  /**
   * Connect to the Voicemod API and authenticate
   *
   * This method must be called before any other methods and
   * will test a number of ports to find one that is available
   *
   * @param api_host string The host to connect to
   */
  async connect(): Promise<void> {
    if (this.connected === true) {
      return;
    }

    this.api_port = await this.find_port()
      .then((port) => {
        return port;
      })
      .catch((error) => {
        return Promise.reject(error);
      });

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
  private async internalEvent<ReturnVal = unknown>(event_id: string): Promise<ReturnVal> {
    return new Promise((resolve) => {
      this.internal_events.once(event_id, resolve);
    });
  }

  /**
   * Finds an open Voicemod port to connect to
   *
   * @returns Promise<number> The port number if found, false if not
   */
  private async find_port(): Promise<number> {
    for (const port of this.possible_ports) {
      const available = await this.test_port(port);
      if (available) {
        return Promise.resolve(port);
      }
    }
    return Promise.reject("Couldn't find an open port");
  }

  /**
   * Tests a given port to see if it is open and a websocket can
   * be connected to it
   *
   * @param port number The port to test
   * @returns Promise<boolean> True if the port is open, false if not
   */
  private async test_port(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${this.api_host}:${port}/v1`);

      ws.onopen = () => {
        ws.close();
        return resolve(true);
      };
      ws.onclose = () => {
        return resolve(false);
      };

      ws.onerror = () => {
        return resolve(false);
      };
    });
  }

  private async onMessage(event: WSMessageEvent) {
    const data: VoicemodMessageEvent = JSON.parse(event.data.toString());
    this.emit('AllEvents', data);

    if (data.msg && data.msg.toLowerCase() === 'pending authentication') {
      this.emit('ClientRegistrationPending');
    } else if (data.action && data.action === 'registerClient') {
      this.internal_events.emit(data.id, data);
    } else if (data.id || data.actionID) {
      // Events triggered by us
      this.emit(this.action_map[data.actionType], data.actionObject);
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
  private ws_send_message(action: string, payload: any = {}): string {
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
  private async ws_get(action: string, payload: any = {}): Promise<any> {
    try {
      return await this.internalEvent(this.ws_send_message(action, payload));
    } catch (error) {
      return Promise.reject(false);
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

    return this.registerClient(this.client_key)
      .then((register) => {
        this.internal_events.emit('Connected');
        this.emit('Connected');
        return Promise.resolve(true);
      })
      .catch((error) => {
        this.emit('ClientRegistrationFailed');
        this.internal_events.emit('Disconnected');
        return Promise.resolve(false);
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
  private async registerClient(clientKey: string): Promise<VoicemodRegisterClientResponse> {
    return this.ws_get('registerClient', {
      clientKey: clientKey,
    })
      .then((register_response: VoicemodRegisterClientResponse) => {
        if (register_response && parseInt(register_response.payload.status.code) === 200) {
          this.connected = true;
          this.emit('ClientRegistered', register_response);
          return register_response;
        } else {
          this.onDisconnect();
          this.emit('ClientRegistrationFailed');
          return register_response;
        }
      })
      .catch((error) => {
        this.onDisconnect();
        this.emit('ClientRegistrationFailed');
        return Promise.reject("Couldn't register client");
      });
  }

  /**
   * Returns the user ID of the currently logged in user
   *
   * @returns Promise<string>
   */
  async getUser(): Promise<string> {
    if (this.user !== null) {
      return Promise.resolve(this.user);
    }

    return this.ws_get('getUser', {})
      .then((user: VoicemodResponseGetUser) => {
        this.user = user.actionObject.userId;
        this.emit('UserChanged', user.actionObject.userId);

        return Promise.resolve(user.actionObject.userId);
      })
      .catch((error) => {
        return Promise.reject('Could not get user');
      });
  }

  /**
   * Requests user license information.
   *
   * @returns Promise<VoicemodResponseGetUserLicense>
   */
  async getUserLicense(): Promise<VoicemodLicenseType> {
    if (this.userLicense !== null) {
      return Promise.resolve(this.userLicense);
    }

    return this.ws_get('getUserLicense', {}).then((userLicense: VoicemodResponseGetUserLicense) => {
      this.userLicense = userLicense.actionObject.licenseType;
      this.emit('UserLicenseChanged', userLicense.actionObject.licenseType);

      return Promise.resolve(userLicense.actionObject.licenseType);
    });
  }

  /**
   * Requests the remaining time (in seconds) before a refresh is
   * made to the selection of voices that are available under the free version.
   *
   * @returns Promise<number>
   */
  async getRotatoryVoicesRemainingTime(): Promise<number> {
    return this.ws_get('getRotatoryVoicesRemainingTime', {}).then(
      (remaining_time: VoicemodResponseGetRotatoryVoicesRemainingTime) => {
        return Promise.resolve(remaining_time.actionObject.remainingTime);
      },
    );
  }

  /**
   * Requests the list of the available voices and the current
   * voice selected in the app for the current user.
   *
   * @returns Promise<VoicemodVoice[]>
   */
  async getVoices(): Promise<VoicemodVoice[]> {
    return this.ws_get('getVoices', {}).then((voices: VoicemodResponseGetVoices) => {
      this.voiceList = voices.actionObject.voices;
      this.emit('VoiceListChanged', voices.actionObject.voices);
      return Promise.resolve(voices.actionObject.voices);
    });
  }

  /**
   * Requests the voice that is currently selected in the app.
   *
   * @returns Promise<VoicemodVoice>
   */
  async getCurrentVoice(): Promise<VoicemodVoice> {
    if (this.current_voice !== null) {
      return Promise.resolve(this.getVoiceFromID(this.current_voice));
    }

    return this.ws_get('getCurrentVoice', {}).then(
      async (current_voice: VoicemodResponseGetCurrentVoice) => {
        const voiceId = current_voice.actionObject.voiceID;

        this.current_voice = voiceId;

        const voice = await this.getVoiceFromID(this.current_voice);
        this.emit('VoiceChanged', voice);

        return Promise.resolve(voice);
      },
    );
  }

  /**
   * Requests all soundboards from the app with info for each
   * soundboard and each sound that is enabled based on the
   * current user's license.
   *
   * @returns Promise<VoicemodSoundboard[]>
   */
  async getAllSoundboard(): Promise<VoicemodSoundboard[]> {
    if (this.soundboards !== null) {
      return Promise.resolve(this.soundboards);
    }

    return this.ws_get('getAllSoundboard', {})
      .then((soundboard: VoicemodResponseGetAllSoundboard) => {
        this.soundboards = soundboard.actionObject.soundboards;
        this.emit('SoundboardListChanged', soundboard.actionObject.soundboards);
        return Promise.resolve(soundboard.actionObject.soundboards);
      })
      .catch((error) => {
        return Promise.resolve([]);
      });
  }

  /**
   * This message is triggered in response to a change in of a currently
   * active soundboard.
   *
   * @returns Promise<VoicemodSoundboard>
   */
  async getActiveSoundboardProfile(): Promise<VoicemodSoundboard> {
    if (this.activeSoundboard !== null) {
      return Promise.resolve(this.getSoundboardFromID(this.activeSoundboard));
    }

    return this.getAllSoundboard().then(async (soundboards) => {
      this.soundboards = soundboards;

      return this.ws_get('getActiveSoundboardProfile', {}).then(
        async (soundboard: VoicemodResponseGetActiveSoundboard) => {
          const activeSoundboard = await this.getSoundboardFromID(
            soundboard.actionObject.profileId,
          );

          if (activeSoundboard) {
            this.activeSoundboard = activeSoundboard ? activeSoundboard.id : null;
            return Promise.resolve(activeSoundboard);
          } else {
            return Promise.reject('Could not find active soundboard');
          }
        },
      );
    });
  }

  /**
   * This message is triggered in response to a change in available meme
   * sounds (the user has added or removed a meme), and in response to
   * a getMemes message.
   *
   * @returns Promise<VoicemodMeme[]>
   */
  async getMemes(): Promise<VoicemodMeme[]> {
    if (this.memes !== null) {
      return Promise.resolve(this.memes);
    }

    return this.ws_get('getMemes', {}).then((memes: VoicemodResponseGetMemes) => {
      this.memes = memes.actionObject.memes;
      this.emit('MemeListChanged', memes.actionObject.memes);
      return Promise.resolve(memes.actionObject.memes);
    });
  }

  /**
   * Requests the icon for a given voice or meme.
   *
   * @param id string The ID of the bitmap to get
   * @returns Promise<VoicemodBitmap>
   */
  async getBitmap(id: string, type: 'voice' | 'meme'): Promise<VoicemodBitmap> {
    let payload;
    if (type === 'voice') {
      payload = { voiceID: id };
    } else if (type === 'meme') {
      payload = { memeID: id };
    } else {
      return Promise.reject('Invalid type');
    }
    return this.ws_get('getBitmap', payload).then((bitmap: VoicemodBitmap) => {
      return Promise.resolve(bitmap);
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
  async loadVoice(
    voiceID: string,
    parameterName: string | null = null,
    parameterValue: string | null = null,
  ): Promise<void> {
    let payload: VoicemodLoadVoicePayload = {
      voiceID: voiceID,
    };

    if (parameterName !== null && parameterValue !== null) {
      payload = {
        ...payload,
        parameterName: parameterName,
        parameterValue: parameterValue,
      };
    }

    return this.ws_get('loadVoice', payload).then(async (response) => {
      return this.onVoiceChange(voiceID);
    });
  }

  setVoice = this.loadVoice;

  /**
   * Requests a change to a randomly selected voice
   *
   * @param mode VoicemodSelectVoiceMode Mode to use when selecting a voice
   */
  async selectRandomVoice(mode: VoicemodSelectVoiceMode | null = null): Promise<void> {
    return this.ws_get('selectRandomVoice', {
      mode: mode,
    });
  }

  /**
   * Requests the current status of the "Hear my voice" button in the app.
   *
   * @returns Promise<boolean>
   */
  async getHearMyselfStatus(): Promise<boolean> {
    if (this.hear_myself_status !== null) {
      return Promise.resolve(this.hear_myself_status);
    }

    return this.ws_get('getHearMyselfStatus', {})
      .then((status) => {
        this.hear_myself_status = status.actionObject.value;
        this.emit('HearMyselfStatusChanged', status.actionObject.value);

        return Promise.resolve(status.actionObject.value);
      })
      .catch((error) => {
        return Promise.reject('Could not get hear myself status');
      });
  }

  /**
   * Requests a toggle of the "Hear my voice" button in the app.
   *
   * @param state boolean The new status of the button
   * @returns Promise<boolean>
   */
  async toggleHearMyVoice(state: boolean): Promise<boolean> {
    return this.ws_get('toggleHearMyVoice', {
      value: state,
    }).then((status: VoicemodResponseToggleHearMyself) => {
      this.hear_myself_status = status.actionObject.value;
      this.emit('HearMyselfStatusChanged', status.actionObject.value);

      return Promise.resolve(status.actionObject.value);
    });
  }

  /**
   * Requests the current state of the "Voice Changer" button in the app.
   *
   * @returns Promise<boolean>
   */
  async getVoiceChangerStatus(): Promise<boolean> {
    if (this.voice_changer_status !== null) {
      return Promise.resolve(this.voice_changer_status);
    }

    return this.ws_get('getVoiceChangerStatus', {}).then((status) => {
      this.voice_changer_status = status.actionObject.value;
      this.emit('VoiceChangerStatusChanged', status.actionObject.value);

      return Promise.resolve(status.actionObject.value);
    });
  }

  /**
   * Requests a toggle of the "Voice Changer" button in the app.
   *
   * @param state boolean The new status of the button
   */
  async toggleVoiceChanger(state: boolean): Promise<boolean> {
    return this.ws_get('toggleVoiceChanger', {
      value: state,
    }).then((status: VoicemodResponseToggleVoiceChanger) => {
      this.voice_changer_status = status.actionObject.value;
      this.emit('VoiceChangerStatusChanged', status.actionObject.value);

      return Promise.resolve(status.actionObject.value);
    });
  }

  /**
   * Requests the current state of the "Background Effects" button in the app.
   *
   * @returns Promise<boolean>
   */
  async getBackgroundEffectsStatus(): Promise<boolean> {
    if (this.background_effects_status !== null) {
      return Promise.resolve(this.background_effects_status);
    }

    return this.ws_get('getBackgroundEffectStatus', {}).then((status) => {
      this.background_effects_status = status.actionObject.value;
      this.emit('BackgroundEffectStatusChanged', status.actionObject.value);

      return Promise.resolve(status.actionObject.value);
    });
  }

  /**
   * Requests a toggle of the "Background Effects" button in the app.
   *
   * @returns Promise<boolean>
   */
  async toggleBackgroundEffects(): Promise<boolean> {
    const status = await this.ws_get('toggleBackgroundEffects', {});

    this.background_effects_status = status.actionObject.value;
    this.emit('BackgroundEffectStatusChanged', status.actionObject.value);

    return Promise.resolve(status.actionObject.value);
  }

  /**
   * Requests the current state of the "Mute" button in the app.
   *
   * @returns Promise<boolean>
   */
  async getMuteMicStatus(): Promise<boolean> {
    if (this.mute_mic_status !== null) {
      return Promise.resolve(this.mute_mic_status);
    }

    return this.ws_get('getMuteMicStatus', {})
      .then((status: VoicemodResponseMuteMicStatus) => {
        this.mute_mic_status = status.actionObject.value;
        this.emit('MuteMicStatusChanged', status.actionObject.value);
        return Promise.resolve(status.actionObject.value);
      })
      .catch((error) => {
        return Promise.resolve(false);
      });
  }

  /**
   * Requests a toggle of the "Mute" button in the app.
   *
   * @returns Promise<boolean>
   */
  async toggleMuteMic(): Promise<void> {
    await this.ws_get('toggleMuteMic', {}).then((status: VoicemodResponseMuteMicStatus) => {
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
  async setBeepSound(state: boolean): Promise<void> {
    this.ws_get('setBeepSound', {
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
  async playMeme(filename: string, isKeyDown: boolean = true): Promise<void> {
    this.ws_get('playMeme', {
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
  async stopMemes(): Promise<void> {
    this.ws_get('stopAllMemeSounds', {});
  }

  /**
   * Requests the current status of the "Mute for me" button in the app (Soundboard menu).
   *
   * @returns Promise<boolean>
   */
  async getMuteMemeForMeStatus(): Promise<boolean> {
    if (this.mute_meme_for_me_status !== null) {
      return Promise.resolve(this.mute_meme_for_me_status);
    }

    return this.ws_get('getMuteMemeForMeStatus', {}).then((mute: VoicemodResponseMuteMicStatus) => {
      this.mute_meme_for_me_status = mute.actionObject.value;

      this.emit('MuteMemeForMeStatusChanged', mute.actionObject.value);

      return Promise.resolve(mute.actionObject.value);
    });
  }

  /**
   * Requests a toggle of the "Mute for me" button in the app (Soundboard menu).
   *
   * @returns Promise<boolean>
   */
  async toggleMuteMemeForMe(): Promise<boolean> {
    return this.ws_get('toggleMuteMemeForMe', {}).then((mute: VoicemodResponseMuteMicStatus) => {
      this.mute_meme_for_me_status = mute.actionObject.value;

      this.emit('MuteMemeForMeStatusChanged', mute.actionObject.value);

      return Promise.resolve(mute.actionObject.value);
    });
  }

  /**
   * Requests a change of parameter for currently selected voice.
   *
   * @param parameterName string The name of the parameter to change
   * @param parameterValue {} The value(s) of the parameter to change
   * @returns Promise<void>
   */
  async setCurrentVoiceParameter(
    parameterName: string,
    parameterValue: VoicemodVoiceParameterValue,
  ): Promise<void> {
    this.ws_get('setCurrentVoiceParameter', {
      parameterName: parameterName,
      parameterValue: parameterValue,
    }).then((response: VoicemodresponseSetCurrentVoiceParameter) => {
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
  private async getVoiceFromID(voice_id: string): Promise<VoicemodVoice> {
    // We always need to have a current voice list - if we don't, we might
    // run into issues where we try to get a voice that doesn't exist in cache (yet)

    return this.getVoices().then((voices) => {
      if (voices === null) {
        return Promise.reject('No voices found');
      }
      this.voiceList = voices;

      return Promise.resolve(this.voiceList.filter((voice) => voice.id === voice_id)[0]);
    });
  }

  /**
   * Gets a soundboard from the soundboard list by ID
   *
   * @param soundboard_id string The ID of the soundboard to get
   * @returns Promise<VoicemodSoundboard>
   */
  private async getSoundboardFromID(soundboard_id: string): Promise<VoicemodSoundboard> {
    return this.getAllSoundboard().then((soundboards) => {
      if (soundboards === null) {
        throw new Error('No soundboards found');
      }
      this.soundboards = soundboards;

      return Promise.resolve(
        this.soundboards.filter((soundboard) => soundboard.id === soundboard_id)[0],
      );
    });
  }
}
