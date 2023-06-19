<template>
  <div id="split" class="split">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Split',
  data() {
    return {} as any as {
      rightPane: HTMLDivElement;
      isSplitterDrag: boolean | undefined;
    };
  },
  mounted() {
    this.$nextTick(() => {
      this.initSplitter();
    });
  },
  methods: {
    initSplitter() {
      this.rightPane = this.$el.querySelector('.pane-right');
      if (!this.rightPane) return; // read-only

      this.$el.onmousedown = (e: MouseEvent) => {
        this.isSplitterDrag = this.isSplitterHover(e);
      };
      this.$el.onmouseup = (_e: MouseEvent) => {
        this.isSplitterDrag = false;
        document.body.style.cursor = 'default';
      };
      this.$el.onmouseleave = (_e: MouseEvent) => {
        if (!this.isSplitterDrag) {
          document.body.style.cursor = 'default';
        }
      };
      this.$el.onmousemove = (e: MouseEvent) => {
        if (this.isSplitterDrag) {
          e.preventDefault();
          document.body.style.cursor = 'ew-resize';
          const x = e.clientX - this.$el.getBoundingClientRect().left;
          const w = this.$el.offsetWidth - x;
          this.rightPane.style.width = w + 'px';
          this.rightPane.style.minWidth = w + 'px';
          this.rightPane.style.maxWidth = w + 'px';
        } else if (e.buttons === 0 && this.isSplitterHover(e)) {
          document.body.style.cursor = 'ew-resize';
        } else {
          document.body.style.cursor = 'default';
        }
      };
    },
    isSplitterHover(e: MouseEvent) {
      if (!this.rightPane) return; // read-only
      const rightPaneWidth = this.rightPane.offsetWidth - 2;
      const x = e.clientX - this.$el.getBoundingClientRect().left;
      return Math.abs(x - (this.$el.offsetWidth - rightPaneWidth)) <= 3;
    }
  }
});
</script>
