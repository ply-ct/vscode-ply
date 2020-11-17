export class Splitter {

    constructor(
        readonly containerElement: HTMLDivElement,
        readonly toolboxContainerElement: HTMLDivElement,
        readonly toolboxCaretElement: HTMLSpanElement
    ) {

        let isSplitterDrag = false;
        const minWidth = 140;

        const isSplitterHover = (e: MouseEvent) => {
            const toolboxWidth = this.toolboxContainerElement.offsetWidth - 2;
            const x = e.clientX - containerElement.getBoundingClientRect().left;
            return (Math.abs(x - (containerElement.offsetWidth - toolboxWidth)) <= 3);
        };

        containerElement.onmousedown = (e: MouseEvent) => {
            isSplitterDrag = isSplitterHover(e);
        };
        containerElement.onmouseup = (_e: MouseEvent) => {
            isSplitterDrag = false;
            document.body.style.cursor = 'default';
        };
        containerElement.onmouseleave = (_e: MouseEvent) => {
            if (!isSplitterDrag) {
                document.body.style.cursor = 'default';
            }
        };
        containerElement.onmousemove = (e: MouseEvent) => {
            if (isSplitterDrag) {
                e.preventDefault();
                document.body.style.cursor = 'ew-resize';
                const x = e.clientX - containerElement.getBoundingClientRect().left;
                const w = containerElement.offsetWidth - x;
                if (w < minWidth) {
                    toolboxContainerElement.style.display = 'none';
                    toolboxCaretElement.style.display = 'inline-block';
                } else {
                    this.toolboxContainerElement.style.width = w + 'px';
                    this.toolboxContainerElement.style.minWidth = w + 'px';
                    this.toolboxContainerElement.style.maxWidth = w + 'px';
                }

            } else if (e.buttons === 0 && isSplitterHover(e)) {
                document.body.style.cursor = 'ew-resize';
            } else {
                document.body.style.cursor = 'default';
            }
        };
    }
}