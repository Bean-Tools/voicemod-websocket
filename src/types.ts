import { ErrorEvent as WSErrorEvent } from 'ws';

export type MapValueToArgsArray<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends void ? [] : [T[K]];
};

// Types adapted from https://control-api.voicemod.net/api-reference/
// These are not complete and the API is all over the place
// in terms of return types, so this is really just a best effort, not
// a complete implementation

export type Voice = {
  id: string;
  friendlyName: string;
  enabled: boolean;
  favorited: boolean;
  isNew: boolean;
  isCustom: boolean;
  bitmapChecksum: string;
};

export type VoiceParameter = {
  [key: string]: { [key: string]: any };
};

export type VoiceParameterValue = {
  value?: number;
  min?: number;
  max?: number;
  displayNormalized?: boolean;
};

export type ResponseGetVoices = {
  id: string;
  actionType: 'getVoices';
  actionObject: {
    voices: Voice[];
    currentVoice: string;
  };
};

export type ResponseGetCurrentVoice = {
  id: string;
  actionType: 'getCurrentVoice';
  actionObject: {
    voiceID: string;
    parameters: VoiceParameter[];
  };
};

export type ResponseMuteMicStatus = {
  actionType: 'toggleMuteMic';
  appVersion: string;
  actionID: string;
  actionObject: {
    value: boolean;
  };
};

export type ResponseGetUser = {
  actionType: 'getUser';
  actionObject: {
    userId: string;
  };
};

export type MessageEvent = {
  actionType: keyof EventTypes;
  actionID: string;
  actionObject?: any;
  msg?: string;
} & RegisterClientResponse;

export type RegisterClientResponse = {
  action: string;
  id: string;
  payload: {
    status: {
      code: string;
      message: string;
    };
  };
};

export type MessageRequest = {
  action: string;
  id: string;
  // TODO: Specify deeper
  payload: any;
};

export type LoadVoicePayload = {
  voiceID: string;
  parameterName?: string;
  parameterValue?: string;
};

export type LicenseType = 'free' | 'pro';

export type ResponseGetUserLicense = {
  actionType: 'getUserLicense';
  actionObject: {
    licenseType: LicenseType;
  };
};

export type ResponseGetRotatoryVoicesRemainingTime = {
  actionType: 'getRotatoryVoicesRemainingTime';
  actionObject: {
    remainingTime: number;
  };
};

export type SoundboardSound = {
  id: string;
  name: string;
  isCustom: boolean;
  enabled: boolean;
  playbackMode: string;
  loop: boolean;
  muteOtherSounds: boolean;
  muteVoice: boolean;
  stopOtherSounds: boolean;
  showProLogo: boolean;
  bitmapChecksum: string;
};

export type Soundboard = {
  id: string;
  name: string;
  isCustom: boolean;
  enabled: boolean;
  showProLogo: boolean;
  sounds: SoundboardSound[];
};

export type ResponseGetAllSoundboard = {
  actionType: 'getAllSoundboard';
  actionObject: {
    soundboards: Soundboard[];
  };
};

export type ResponseGetActiveSoundboard = {
  actionType: 'getActiveSoundboard';
  actionObject: {
    profileId: string;
  };
};

export type MemeType =
  | 'PlayRestart'
  | 'PlayPause'
  | 'PlayStop'
  | 'PlayOverlap'
  | 'PlayLoopOnPress';

export type Meme = {
  Name: string;
  FileName: string;
  Type: MemeType;
  Image: string;
};

export type ResponseGetMemes = {
  actionType: 'getMemes';
  actionObject: {
    memes: Meme[];
  };
};

export type Bitmap = {
  default: string;
  selected: string;
  transparent: string;
};

export type ResponseGetBitmap = {
  actionType: 'getBitmap';
  actionID: string;
  appVersion: string;
  context: string;
  actionObject: Bitmap;
};

export type ResponseToggleHearMyself = {
  actionType: 'toggleHearMyself';
  appVersion: string;
  actionId: string;
  actionObject: {
    value: boolean;
  };
};

export type ResponseToggleVoiceChanger = {
  actionType: 'toggleVoiceChanger';
  appVersion: string;
  actionId: string;
  actionObject: {
    value: boolean;
  };
};

export type ResponseVoiceParameter = {
  voiceID: string;
  parameters: VoiceParameter[];
};

export type ResponseSetCurrentVoiceParameter = {
  actionType: 'setCurrentVoiceParameter';
  appVersion: string;
  actionID: string;
  actionObject: ResponseVoiceParameter;
};

export type EventTypes = {
  /**
   * Catch-all for all events
   */
  AllEvents: any;

  ConnectionOpened: void;
  ConnectionClosed: void;
  ConnectionError: WSErrorEvent;
  Connected: void;
  Disconnected: void;

  ClientRegistered: RegisterClientResponse;
  ClientRegistrationFailed: void;
  ClientRegistrationPending: void;

  UserChanged: string;
  UserLicenseChanged: string;

  VoiceChanged: Voice;
  VoiceListChanged: Voice[];
  VoiceParameterChanged: ResponseVoiceParameter;
  VoiceChangerStatusChanged: boolean;

  MemeListChanged: Meme[];
  SoundboardListChanged: Soundboard[];

  HearMyselfStatusChanged: boolean;
  BackgroundEffectStatusChanged: boolean;
  MuteMicStatusChanged: boolean;
  MuteMemeForMeStatusChanged: boolean;
  BadLanguageStatusChanged: boolean;
};

export type SelectVoiceMode =
  | 'AllVoices'
  | 'FreeVoices'
  | 'FavoriteVoices'
  | 'CustomVoices';

export type VoiceState = {
  port?: number;

  voiceList?: Voice[];
  currentVoice?: string;

  user?: string;
  userLicense?: LicenseType;

  soundboards?: Soundboard[];
  activeSoundboard?: string;

  memes?: Meme[];

  hearMyselfStatus?: boolean;
  voiceChangerStatus?: boolean;
  backgroundEffectsStatus?: boolean;
  muteMemeForMeStatus?: boolean;
  muteMicStatus?: boolean;
}