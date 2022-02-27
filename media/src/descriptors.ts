import * as flowbee from 'flowbee/dist/nostyles';

export const descriptors: flowbee.Descriptor[] = [
    flowbee.start,
    flowbee.stop,
    // flowbee.decide,
    flowbee.embedded,
    { ...flowbee.note, icon: 'note.svg' },
    {
        type: 'step',
        path: 'request',
        name: 'Request',
        icon: 'request.svg'
    }
    /*
    {
        type: 'step',
        path: 'typescript',
        name: 'TypeScript',
        icon: 'typescript.svg'
    }
    {
        type: 'step',
        path: 'sync',
        name: 'Sync',
        icon: 'sync.svg'
    }
    */
];
