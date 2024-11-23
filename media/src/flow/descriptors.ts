import * as flowbee from 'flowbee/dist/nostyles';

export const getDescriptors = (customDescriptors?: flowbee.Descriptor[]): flowbee.Descriptor[] => {
    const descriptors: flowbee.Descriptor[] = [];
    descriptors.push(
        ...([
            flowbee.start,
            flowbee.stop,
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
                path: 'typescript',
                name: 'TypeScript',
                icon: 'typescript.svg'
            },
            {
                type: 'step',
                path: 'value',
                name: 'Set Value',
                icon: 'value.svg'
            },
            flowbee.decide,
            {
                type: 'step',
                path: 'log',
                name: 'Log',
                icon: 'log.svg'
            },
            {
                type: 'step',
                path: 'delay',
                name: 'Delay',
                icon: 'delay.svg'
            },
            {
                type: 'step',
                path: 'subflow',
                name: 'Subflow',
                icon: 'subflow.svg'
            },
            {
                type: 'step',
                path: 'sync',
                name: 'Sync',
                icon: 'sync.svg'
            },
            {
                type: 'step',
                path: 'websocket',
                name: 'WebSocket',
                icon: 'websocket.svg'
            }
        ] as flowbee.Descriptor[])
    );

    if (customDescriptors) {
        descriptors.push(...customDescriptors);
    }

    console.log('DESCRIPTORS: ' + JSON.stringify(descriptors, null, 2));
    return descriptors;
};
