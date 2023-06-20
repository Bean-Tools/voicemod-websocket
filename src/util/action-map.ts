import {
    type EventTypes
} from '../types';

export default <{ [key: string]: keyof EventTypes }>{
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