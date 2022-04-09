import { ChartOptions } from 'chart.js';
import { enUS } from 'date-fns/locale';
import color from '@kurkle/color';

export const chartOptions: ChartOptions = {
    animation: false,
    responsive: true,
    // maintainAspectRatio: false,
    parsing: false,
    // scales: {
    //     x: {
    //         type: 'time',
    //         // adapters: {
    //         //     date: enUS
    //         // },
    //         // time: {
    //         //     unit: 'millisecond'
    //         //     //     // displayFormats: {
    //         //     //     //     second: 'h:mmaaaaa'
    //         //     //     // }
    //         // }
    //     }
    // }
    scales: {
        x: {
            type: 'time',
            adapters: {
                date: enUS
            }
        }
    }
};

export const borderColor = (i: number): string => {
    if (COLORS.length > i) {
        return COLORS[i];
    } else {
        return '';
    }
};

export const backgroundColor = (i: number): string => {
    const brdrColor = borderColor(i);
    return brdrColor ? transparentize(brdrColor) : '';
};

export const transparentize = (hex: string, opacity = 0.5) => {
    const c = color(hex);
    return c.valid ? c.alpha(1 - opacity).rgbString() : '';
};

export const COLORS = [
    '#3366cc',
    '#ff9900',
    '#dc3912',
    '#109618',
    '#990099',
    '#3b3eac',
    '#0099c6',
    '#dd4477',
    '#66aa00',
    '#b82e2e',
    '#316395',
    '#994499',
    '#22aa99',
    '#aaaa11',
    '#6633cc',
    '#e67300',
    '#8b0707',
    '#329262',
    '#5574a6',
    '#3b3eac',
    '#a6cee3',
    '#1f78b4',
    '#b2df8a',
    '#33a02c',
    '#fb9a99',
    '#e31a1c',
    '#fdbf6f',
    '#ff7f00',
    '#cab2d6',
    '#6a3d9a',
    '#ffff99',
    '#b15928',
    '#ac3ec1',
    '#477bd1',
    '#46b298',
    '#90ba4c',
    '#dd9d31',
    '#e25247',
    '#7a7a7a',
    '#f5c201',
    '#526db0',
    '#989aac',
    '#dc5924',
    '#b4b392'
];
