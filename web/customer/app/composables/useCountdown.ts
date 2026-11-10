/** Segundos que faltam até `target` (ISO), atualizados a cada segundo. Nunca fica negativo. */
export function useCountdown(target: Ref<string | undefined>) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)))
  onBeforeUnmount(() => clearInterval(timer))

  const seconds = computed(() =>
    target.value ? Math.max(0, Math.ceil((new Date(target.value).getTime() - now.value) / 1000)) : 0
  )
  const label = computed(() =>
    `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`
  )
  return { seconds, label }
}
