<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="darkThemeOverrides">
    <WorkbenchShell />
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider } from 'naive-ui'
import WorkbenchShell from './components/workbench/WorkbenchShell.vue'
import { darkTheme, darkThemeOverrides } from './theme'
</script>
