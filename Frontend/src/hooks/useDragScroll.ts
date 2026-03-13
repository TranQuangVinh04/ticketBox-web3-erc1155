import { useRef, useEffect } from 'react'

export const useDragScroll = () => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)
  const velocity = useRef(0)
  const lastX = useRef(0)
  const lastTime = useRef(0)

  useEffect(() => {
    const slider = scrollRef.current
    if (!slider) return

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true
      startX.current = e.pageX - slider.offsetLeft
      scrollLeft.current = slider.scrollLeft
      lastX.current = e.pageX
      lastTime.current = Date.now()
      velocity.current = 0
      slider.style.cursor = 'grabbing'
      slider.style.scrollSnapType = 'none'
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      
      const currentTime = Date.now()
      const currentX = e.pageX
      const timeDiff = currentTime - lastTime.current
      
      if (timeDiff > 0) {
        velocity.current = (currentX - lastX.current) / timeDiff
      }
      
      lastX.current = currentX
      lastTime.current = currentTime
      
      const x = e.pageX - slider.offsetLeft
      const walk = (x - startX.current) * 1.5
      slider.scrollLeft = scrollLeft.current - walk
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      slider.style.cursor = 'grab'
      
      // Add momentum scrolling
      const momentum = velocity.current * 50
      const targetScroll = slider.scrollLeft - momentum
      
      slider.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      })
      
      setTimeout(() => {
        slider.style.scrollSnapType = 'x mandatory'
      }, 100)
    }

    const handleMouseLeave = () => {
      if (isDragging.current) {
        handleMouseUp()
      }
    }

    // Touch events for mobile
    const handleTouchStart = (e: TouchEvent) => {
      isDragging.current = true
      startX.current = e.touches[0].pageX - slider.offsetLeft
      scrollLeft.current = slider.scrollLeft
      lastX.current = e.touches[0].pageX
      lastTime.current = Date.now()
      velocity.current = 0
      slider.style.scrollSnapType = 'none'
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return
      
      const currentTime = Date.now()
      const currentX = e.touches[0].pageX
      const timeDiff = currentTime - lastTime.current
      
      if (timeDiff > 0) {
        velocity.current = (currentX - lastX.current) / timeDiff
      }
      
      lastX.current = currentX
      lastTime.current = currentTime
      
      const x = e.touches[0].pageX - slider.offsetLeft
      const walk = (x - startX.current) * 1.5
      slider.scrollLeft = scrollLeft.current - walk
    }

    const handleTouchEnd = () => {
      if (!isDragging.current) return
      isDragging.current = false
      
      // Add momentum scrolling
      const momentum = velocity.current * 50
      const targetScroll = slider.scrollLeft - momentum
      
      slider.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      })
      
      setTimeout(() => {
        slider.style.scrollSnapType = 'x mandatory'
      }, 100)
    }

    // Add event listeners
    slider.addEventListener('mousedown', handleMouseDown)
    slider.addEventListener('mousemove', handleMouseMove)
    slider.addEventListener('mouseup', handleMouseUp)
    slider.addEventListener('mouseleave', handleMouseLeave)
    slider.addEventListener('touchstart', handleTouchStart, { passive: true })
    slider.addEventListener('touchmove', handleTouchMove, { passive: true })
    slider.addEventListener('touchend', handleTouchEnd)

    // Prevent click event when dragging
    const handleClick = (e: MouseEvent) => {
      if (Math.abs(velocity.current) > 0.1) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    slider.addEventListener('click', handleClick, { capture: true })

    // Cleanup
    return () => {
      slider.removeEventListener('mousedown', handleMouseDown)
      slider.removeEventListener('mousemove', handleMouseMove)
      slider.removeEventListener('mouseup', handleMouseUp)
      slider.removeEventListener('mouseleave', handleMouseLeave)
      slider.removeEventListener('touchstart', handleTouchStart)
      slider.removeEventListener('touchmove', handleTouchMove)
      slider.removeEventListener('touchend', handleTouchEnd)
      slider.removeEventListener('click', handleClick, { capture: true })
    }
  }, [])

  return scrollRef
}
