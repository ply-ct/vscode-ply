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
        path: 'request.ts',
        name: 'Request',
        icon: 'request.svg'
    },
    {
        type: 'step',
        path: 'sync.ts',
        name: 'Sync',
        icon: 'sync.svg'
    },
    {
        type: 'step',
        path: 'script.ts',
        name: 'Script',
        icon: 'typescript.svg'
    }
];