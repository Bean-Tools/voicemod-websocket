import { ErrorEvent as WSErrorEvent } from 'ws';

export type MapValueToArgsArray<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends void ? [] : [T[K]];
};

// Types adapted from https://control-api.voicemod.net/api-reference/
// These are not complete and the API is all over the place
// in terms of return types, so this is really just a best effort, not
// a complete implementation

export type VoicemodVoice = {
  id: string;
  friendlyName: string;
  enabled: boolean;
  favorited: boolean;
  isNew: boolean;
  isCustom: boolean;
  bitmapChecksum: string;
};

export type VoicemodVoiceParameter = {
  [key: string]: { [key: string]: any };
};

export type VoicemodVoiceParameterValue = {
  value?: number;
  min?: number;
  max?: number;
  displayNormalized?: boolean;
};

export type VoicemodResponseGetVoices = {
  id: string;
  actionType: 'getVoices';
  actionObject: {
    voices: VoicemodVoice[];
    currentVoice: string;
  };
};

export type VoicemodResponseGetCurrentVoice = {
  id: string;
  actionType: 'getCurrentVoice';
  actionObject: {
    voiceID: string;
    parameters: VoicemodVoiceParameter[];
  };
};

export type VoicemodResponseMuteMicStatus = {
  actionType: 'toggleMuteMic';
  appVersion: string;
  actionID: string;
  actionObject: {
    value: boolean;
  };
};

export type VoicemodResponseGetUser = {
  actionType: 'getUser';
  actionObject: {
    userId: string;
  };
};

export type VoicemodMessageEvent = {
  actionType: keyof EventTypes;
  actionID: string;
  actionObject?: any;
  msg?: string;
} & VoicemodRegisterClientResponse;

export type VoicemodRegisterClientResponse = {
  action: string;
  id: string;
  payload: {
    status: {
      code: string;
      message: string;
    };
  };
};

export type VoicemodMessageRequest = {
  action: string;
  id: string;
  // TODO: Specify deeper
  payload: any;
};

export type VoicemodLoadVoicePayload = {
  voiceID: string;
  parameterName?: string;
  parameterValue?: string;
};

export type VoicemodLicenseType = 'free' | 'pro';

export type VoicemodResponseGetUserLicense = {
  actionType: 'getUserLicense';
  actionObject: {
    licenseType: VoicemodLicenseType;
  };
};

export type VoicemodResponseGetRotatoryVoicesRemainingTime = {
  actionType: 'getRotatoryVoicesRemainingTime';
  actionObject: {
    remainingTime: number;
  };
};

export type VoicemodSoundboardSound = {
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

export type VoicemodSoundboard = {
  id: string;
  name: string;
  isCustom: boolean;
  enabled: boolean;
  showProLogo: boolean;
  sounds: VoicemodSoundboardSound[];
};

export type VoicemodResponseGetAllSoundboard = {
  actionType: 'getAllSoundboard';
  actionObject: {
    soundboards: VoicemodSoundboard[];
  };
};

export type VoicemodResponseGetActiveSoundboard = {
  actionType: 'getActiveSoundboard';
  actionObject: {
    profileId: string;
  };
};

export type VoicemodMemeType =
  | 'PlayRestart'
  | 'PlayPause'
  | 'PlayStop'
  | 'PlayOverlap'
  | 'PlayLoopOnPress';

export type VoicemodMeme = {
  Name: string;
  FileName: string;
  Type: VoicemodMemeType;
  Image: string;
};

export type VoicemodResponseGetMemes = {
  actionType: 'getMemes';
  actionObject: {
    memes: VoicemodMeme[];
  };
};

export type VoicemodBitmap = {
  default: string;
  selected: string;
  transparent: string;
};

export type VoicemodResponseGetBitmap = {
  actionType: 'getBitmap';
  actionID: string;
  appVersion: string;
  context: string;
  actionObject: VoicemodBitmap;
};

export type VoicemodResponseToggleHearMyself = {
  actionType: 'toggleHearMyself';
  appVersion: string;
  actionId: string;
  actionObject: {
    value: boolean;
  };
};

export type VoicemodResponseToggleVoiceChanger = {
  actionType: 'toggleVoiceChanger';
  appVersion: string;
  actionId: string;
  actionObject: {
    value: boolean;
  };
};

export type VoicemodResponseVoiceParameter = {
  voiceID: string;
  parameters: VoicemodVoiceParameter[];
};

export type VoicemodresponseSetCurrentVoiceParameter = {
  actionType: 'setCurrentVoiceParameter';
  appVersion: string;
  actionID: string;
  actionObject: VoicemodResponseVoiceParameter;
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

  ClientRegistered: VoicemodRegisterClientResponse;
  ClientRegistrationFailed: void;
  ClientRegistrationPending: void;

  UserChanged: string;
  UserLicenseChanged: string;

  VoiceChanged: VoicemodVoice;
  VoiceListChanged: VoicemodVoice[];
  VoiceParameterChanged: VoicemodResponseVoiceParameter;
  VoiceChangerStatusChanged: boolean;

  MemeListChanged: VoicemodMeme[];
  SoundboardListChanged: VoicemodSoundboard[];

  HearMyselfStatusChanged: boolean;
  BackgroundEffectStatusChanged: boolean;
  MuteMicStatusChanged: boolean;
  MuteMemeForMeStatusChanged: boolean;
  BadLanguageStatusChanged: boolean;
};

export type VoicemodSelectVoiceMode =
  | 'AllVoices'
  | 'FreeVoices'
  | 'FavoriteVoices'
  | 'CustomVoices';
