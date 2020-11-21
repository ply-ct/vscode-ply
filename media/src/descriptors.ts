import * as flowbee from 'flowbee/dist/nostyles';

// TODO move this to vscode-ply
export const descriptors: flowbee.Descriptor[] = [
    flowbee.start,
    flowbee.stop,
    flowbee.decide,
    flowbee.embedded,
    { ...flowbee.note, icon: 'note.svg' },
    {
        type: 'step',
        path: 'request',
        name: 'Request',
        icon: 'request.svg'
    },
    {
        type: 'step',
        path: 'sync',
        name: 'Sync',
        icon: 'sync.svg'
    },
    {
        type: 'step',
        path: 'script',
        name: 'Script',
        icon: 'typescript.svg'
    }
];