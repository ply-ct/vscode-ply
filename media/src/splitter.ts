export class FlowSplitter {
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
            return Math.abs(x - (containerElement.offsetWidth - toolboxWidth)) <= 3;
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
                    toolboxContainerElement.style.width = w + 'px';
                    toolboxContainerElement.style.minWidth = w + 'px';
                    toolboxContainerElement.style.maxWidth = w + 'px';
                }
            } else if (e.buttons === 0 && isSplitterHover(e)) {
                document.body.style.cursor = 'ew-resize';
            } else {
                document.body.style.cursor = 'default';
            }
        };
    }
}

export class ToolboxSplitter {
    isOpen = true;

    flowToolboxContainer: HTMLDivElement;
    flowRequestsContainer: HTMLDivElement;
    flowRequestsHeader: HTMLDivElement;

    constructor(readonly toolboxContainer: HTMLDivElement) {
        this.flowToolboxContainer = document.getElementById(
            'flow-toolbox-container'
        ) as HTMLDivElement;
        this.flowRequestsContainer = document.getElementById(
            'flow-requests-container'
        ) as HTMLDivElement;
        this.flowRequestsHeader = this.flowRequestsContainer.querySelector(
            '.toolbox-header'
        ) as HTMLDivElement;

        let isSplitterDrag = false;
        const minFlowRequestsHeight = 100;
        const isSplitterHover = (e: MouseEvent) => {
            if (!this.isOpen) return false;
            const rect = toolboxContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < 5) return false; // avoid interfering with horizontal splitter
            const y = e.clientY - rect.top;
            const flowToolboxHeight = this.flowToolboxContainer.offsetHeight - 2;
            return Math.abs(y - flowToolboxHeight) <= 3;
        };
        toolboxContainer.onmousedown = (e: MouseEvent) => {
            isSplitterDrag = isSplitterHover(e);
        };
        toolboxContainer.onmouseup = (_e: MouseEvent) => {
            if (isSplitterDrag) {
                this.flowRequestsContainer.style.height = '100%';
                this.flowRequestsContainer.style.minHeight = '100%';
            }
            isSplitterDrag = false;
            document.body.style.cursor = 'default';
            this.flowRequestsHeader.style.cursor = 'pointer';
        };
        toolboxContainer.onmouseleave = (_e: MouseEvent) => {
            if (!isSplitterDrag) {
                document.body.style.cursor = 'default';
                this.flowRequestsHeader.style.cursor = 'pointer';
            }
        };
        toolboxContainer.onmousemove = (e: MouseEvent) => {
            if (isSplitterDrag) {
                e.preventDefault();
                document.body.style.cursor = 'ns-resize';
                const y = e.clientY - toolboxContainer.getBoundingClientRect().top;
                const flowRequestsHeight = this.toolboxContainer.offsetHeight - y;
                if (flowRequestsHeight > minFlowRequestsHeight) {
                    this.flowToolboxContainer.style.height = y + 'px';
                    this.flowToolboxContainer.style.minHeight = y + 'px';
                    this.flowToolboxContainer.style.maxHeight = y + 'px';
                }
            } else if (e.buttons === 0 && isSplitterHover(e)) {
                document.body.style.cursor = 'ns-resize';
                this.flowRequestsHeader.style.cursor = 'ns-resize';
            } else {
                document.body.style.cursor = 'default';
                this.flowRequestsHeader.style.cursor = 'pointer';
            }
        };

        let headerClick = false;
        this.flowRequestsHeader.onmousedown = (_e: MouseEvent) => {
            headerClick = true;
        };
        this.flowRequestsHeader.onmouseup = (_e: MouseEvent) => {
            if (headerClick) {
                headerClick = false;
                if (!isSplitterDrag) {
                    this.toggleFlowRequests();
                }
            }
        };
    }

    toggleFlowRequests() {
        const flowRequestsCaret = this.flowRequestsHeader.querySelector(
            '.toolbox-caret'
        ) as HTMLSpanElement;
        const flowRequestsElement = document.getElementById('flow-requests') as HTMLDivElement;

        // retain width
        const toolboxWidth = this.toolboxContainer.offsetWidth;
        this.toolboxContainer.style.width = toolboxWidth + 'px';
        this.toolboxContainer.style.minWidth = toolboxWidth + 'px';
        this.toolboxContainer.style.maxWidth = toolboxWidth + 'px';

        if (flowRequestsElement.style.display === 'none') {
            flowRequestsElement.style.display = 'block';
            this.flowToolboxContainer.style.height = '';
            this.flowToolboxContainer.style.minHeight = '';
            this.flowToolboxContainer.style.maxHeight = '';
            this.flowRequestsContainer.style.height = '50%';
            this.flowRequestsContainer.style.minHeight = '50%';
            this.isOpen = true;
        } else {
            flowRequestsElement.style.display = 'none';
            this.flowToolboxContainer.style.height = '100%';
            this.flowToolboxContainer.style.minHeight = '100%';
            this.flowToolboxContainer.style.maxHeight = '100%';
            this.isOpen = false;
        }
        this.flowToolboxContainer.classList.toggle('flow-toolbox-container-maxed');
        flowRequestsCaret.classList.toggle('flow-requests-caret-closed');
    }
}
