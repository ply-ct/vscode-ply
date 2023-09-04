export interface Options {
    base: string;
    theme: 'light' | 'dark';
    iconBase: string;
    dummyUrl: string;
    runnable?: boolean;
    indent?: number;
    readonly?: false;
    lineNumbers?: boolean;
    folding?: boolean;
    hovers?: boolean;
}
