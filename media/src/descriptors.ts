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
            flowbee.decide
            /*
            {
                type: 'step',
                path: 'sync',
                name: 'Sync',
                icon: 'sync.svg'
            }
            */
        ] as flowbee.Descriptor[])
    );

    if (customDescriptors) {
        descriptors.push(...customDescriptors);
    }
    return descriptors;
};
