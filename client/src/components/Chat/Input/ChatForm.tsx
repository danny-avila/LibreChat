import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
} from '~/hooks';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { TextareaAutosize } from '~/components';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import PhoneButton from './PhoneButton';
import store from '~/store';

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  useFocusChatEffect(textAreaRef);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);
  const [showElevenLabsWidget, setShowElevenLabsWidget] = useState(false);
  
  // Ref para trackear el observer actual y evitar duplicados
  const elevenLabsObserverRef = useRef<MutationObserver | null>(null);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const { requiresKey } = useRequiresKey();
  const methods = useChatFormContext();
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    newConversation,
    handleStopGenerating,
  } = useChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );
  const conversationId = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );

  const isRTL = useMemo(
    () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
    [chatDirection],
  );
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant,
    [requiresKey, invalidAssistant],
  );

  const handleContainerClick = useCallback(() => {
    /** Check if the device is a touchscreen */
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      return;
    }
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting: isSubmitting || isSubmittingAdded,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
  });
  const {
    isNotAppendable,
    handlePaste,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextarea({
    textAreaRef,
    submitButtonRef,
    setIsScrollable,
    disabled: disableInputs,
  });

  useQueryParams({ textAreaRef });

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        methods.setValue('text', e.target.value, { shouldValidate: true }),
      [methods],
    ),
  });

  const textValue = useWatch({ control: methods.control, name: 'text' });

  useEffect(() => {
    if (textAreaRef.current) {
      const style = window.getComputedStyle(textAreaRef.current);
      const lineHeight = parseFloat(style.lineHeight);
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  useEffect(() => {
    if (isEditingBadges && backupBadges.length === 0) {
      setBackupBadges([...badges]);
    }
  }, [isEditingBadges, badges, backupBadges.length]);

  const handleSaveBadges = useCallback(() => {
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [setIsEditingBadges, setBackupBadges]);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges, setIsEditingBadges]);

  const handlePhoneClick = useCallback(() => {
    console.log('Botón de teléfono clickeado');
    
    // Si el widget está oculto, mostrarlo y configurar la funcionalidad
    if (!showElevenLabsWidget) {
      setShowElevenLabsWidget(true);
      
      // Usar setTimeout para asegurar que el widget esté renderizado
      setTimeout(() => {
        setupElevenLabsWidget();
      }, 100);
    }
    // Si ya está visible, no hacer nada (según requerimientos)
  }, [showElevenLabsWidget]);

  // Función auxiliar para configurar el widget de ElevenLabs
  const setupElevenLabsWidget = useCallback(() => {
    try {
      const elevenLabsWidget = document.querySelector('elevenlabs-convai');
      if (!elevenLabsWidget?.shadowRoot) {
        console.log('Widget de ElevenLabs no encontrado o shadowRoot no disponible');
        return;
      }

      console.log('Configurando widget de ElevenLabs...');

      // Limpiar observer anterior si existe
      if (elevenLabsObserverRef.current) {
        elevenLabsObserverRef.current.disconnect();
        elevenLabsObserverRef.current = null;
        console.log('Observer anterior desconectado');
      }

      // Flags para evitar reconfiguración múltiple
      let collapseConfigured = false;
      let endConfigured = false;

      // Función para activar automáticamente el botón "Llamar a AVI"
      const activateCallButton = () => {
        try {
          // Buscar el botón "Llamar a AVI" específicamente
          const aviButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label="Llamar a AVI"]') as HTMLButtonElement;
          if (aviButton) {
            aviButton.click();
            console.log('Botón "Llamar a AVI" activado automáticamente');
            return;
          }

          // Fallback: buscar cualquier botón de llamada
          const callButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label*="Llamar"], button[aria-label*="Call"]') as HTMLButtonElement;
          if (callButton) {
            callButton.click();
            console.log('Botón de llamada activado automáticamente (fallback)');
            return;
          }

          // Último fallback: hacer clic en el primer botón disponible
          const anyButton = elevenLabsWidget.shadowRoot?.querySelector('button') as HTMLButtonElement;
          if (anyButton) {
            anyButton.click();
            console.log('Primer botón disponible activado automáticamente');
          }
        } catch (error) {
          console.error('Error al activar botón de llamada:', error);
        }
      };

      // Función común para ocultar widget
      const hideWidget = () => {
        // Limpiar observer antes de ocultar
        if (elevenLabsObserverRef.current) {
          elevenLabsObserverRef.current.disconnect();
          elevenLabsObserverRef.current = null;
        }
        
        setTimeout(() => {
          setShowElevenLabsWidget(false);
          console.log('Widget ocultado');
        }, 100);
      };

      // Función para cortar llamada (opcional)
      const endCall = () => {
        try {
          const endButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label="End"]') as HTMLButtonElement;
          if (endButton) {
            endButton.click();
            console.log('Llamada cortada');
            return true;
          }
        } catch (error) {
          console.error('Error al cortar la llamada:', error);
        }
        return false;
      };

      // Función combinada para cortar llamada Y ocultar widget
      const endCallAndHideWidget = (event?: Event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        
        endCall(); // Intentar cortar llamada si es posible
        hideWidget(); // SIEMPRE ocultar widget
      };

      // Configurar botón "Collapse" (Paso 3 de los requerimientos)
      const setupCollapseButton = () => {
        if (collapseConfigured) return true;
        
        try {
          // Buscar el botón "Collapse" con selectores más robustos
          const collapseButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement;
          
          if (collapseButton) {
            // SIEMPRE agregar funcionalidad para ocultar widget + cortar llamada si está disponible
            collapseButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              
              // Intentar cortar llamada si el botón "End" está disponible
              const callEnded = endCall();
              
              // SIEMPRE ocultar el widget, independientemente de si se cortó la llamada o no
              hideWidget();
              
              console.log(`Collapse ejecutado - Llamada cortada: ${callEnded ? 'Sí' : 'No'}, Widget ocultado: Sí`);
            }, { capture: true, once: true });
            
            collapseConfigured = true;
            console.log('Botón "Collapse" configurado correctamente (oculta SIEMPRE)');
            return true;
          }
        } catch (error) {
          console.error('Error al configurar botón Collapse:', error);
        }
        return false;
      };

      // Configurar botón "End" (Paso 4 de los requerimientos)
      const setupEndButton = (endButton: HTMLButtonElement) => {
        if (endConfigured) return true;
        
        try {
          // Solo agregar event listener para ocultar widget después del click original
          endButton.addEventListener('click', () => {
            setTimeout(() => {
              hideWidget(); // Usar la función de ocultar widget
              console.log('Widget ocultado por botón End');
            }, 200);
          }, { once: true });
          
          endConfigured = true;
          console.log('Botón "End" configurado correctamente');
          return true;
        } catch (error) {
          console.error('Error al configurar botón End:', error);
          return false;
        }
      };

      // Activar el botón de llamada inmediatamente
      activateCallButton();

      // Función de retry para configurar el botón "Collapse"
      const retryConfigureCollapse = (attempts = 0, maxAttempts = 10) => {
        if (attempts >= maxAttempts || collapseConfigured) {
          console.log(`Configuración de Collapse terminada - Intentos: ${attempts}, Configurado: ${collapseConfigured}`);
          return;
        }

        const success = setupCollapseButton();
        if (!success) {
          // Reintentar después de 200ms
          setTimeout(() => {
            retryConfigureCollapse(attempts + 1, maxAttempts);
          }, 200);
        }
      };

      // Configurar el botón "Collapse" con retry mechanism
      setTimeout(() => {
        retryConfigureCollapse();
      }, 300); // Dar tiempo para que aparezca el botón después de activar la llamada

      // Buscar el botón "End" inmediatamente
      const immediateEndButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label="End"]') as HTMLButtonElement;
      if (immediateEndButton) {
        setupEndButton(immediateEndButton);
        console.log('Configuración inicial completada (End encontrado inmediatamente)');
        return; // Salir temprano si ya encontramos el botón End
      }

      console.log('Configuración inicial del widget...');

      // Solo usar MutationObserver si no encontramos el botón "End" inmediatamente
      const observer = new MutationObserver((mutations) => {
        // Verificar si ya configuramos todo
        if (endConfigured && collapseConfigured) {
          observer.disconnect();
          elevenLabsObserverRef.current = null;
          console.log('Observer desconectado - configuración completa');
          return;
        }

        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            
            // Buscar y configurar botón "End"
            if (!endConfigured) {
              const endButton = elevenLabsWidget.shadowRoot?.querySelector('button[aria-label="End"]') as HTMLButtonElement;
              if (endButton) {
                setupEndButton(endButton);
              }
            }
            
            // Buscar y configurar botón "Collapse"
            if (!collapseConfigured) {
              setupCollapseButton();
            }
            
            // Desconectar observer una vez que configuramos todo
            if (endConfigured && collapseConfigured) {
              console.log('Configuración completada via observer, desconectando');
              observer.disconnect();
              elevenLabsObserverRef.current = null;
              return;
            }
          }
        }
      });

      // Guardar referencia del observer
      elevenLabsObserverRef.current = observer;

      // Iniciar observación del shadowRoot solo para nuevos nodos
      observer.observe(elevenLabsWidget.shadowRoot, { 
        childList: true, 
        subtree: true,
        attributes: false // No observar cambios de atributos
      });

      // Limpiar el observer después de 10 segundos para evitar memory leaks
      setTimeout(() => {
        if (elevenLabsObserverRef.current === observer) {
          observer.disconnect();
          elevenLabsObserverRef.current = null;
          console.log('Observer limpiado por timeout');
        }
      }, 10000); // Reducir a 10 segundos

    } catch (error) {
      console.error('Error al configurar el widget de ElevenLabs:', error);
    }
  }, [setShowElevenLabsWidget]);

  // Cleanup effect para limpiar observer cuando el componente se desmonte
  useEffect(() => {
    return () => {
      if (elevenLabsObserverRef.current) {
        elevenLabsObserverRef.current.disconnect();
        elevenLabsObserverRef.current = null;
      }
    };
  }, []);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <>
      <form
        onSubmit={methods.handleSubmit(submitMessage)}
        className={cn(
          'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
          maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
          centerFormOnLanding &&
            (conversationId == null || conversationId === Constants.NEW_CONVO) &&
            !isSubmitting &&
            conversation?.messages?.length === 0
            ? 'transition-all duration-200 sm:mb-28'
            : 'sm:mb-10',
        )}
      >
        <div className="relative flex h-full flex-1 items-stretch md:flex-col">
          <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
            {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
              <Mention
                setShowMentionPopover={setShowPlusPopover}
                newConversation={generateConversation}
                textAreaRef={textAreaRef}
                commandChar="+"
                placeholder="com_ui_add_model_preset"
                includeAssistants={false}
              />
            )}
            {showMentionPopover && (
              <Mention
                setShowMentionPopover={setShowMentionPopover}
                newConversation={newConversation}
                textAreaRef={textAreaRef}
              />
            )}
            <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
            <div
              onClick={handleContainerClick}
              className={cn(
                'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
                isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
                isTemporary
                  ? 'border-violet-800/60 bg-violet-950/10'
                  : 'border-border-light bg-surface-chat',
              )}
            >
              <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
              <EditBadges
                isEditingChatBadges={isEditingBadges}
                handleCancelBadges={handleCancelBadges}
                handleSaveBadges={handleSaveBadges}
                setBadges={setBadges}
              />
              <FileFormChat disableInputs={disableInputs} />
              {endpoint && (
                <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                  <TextareaAutosize
                    {...registerProps}
                    ref={(e) => {
                      ref(e);
                      (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                    }}
                    disabled={disableInputs || isNotAppendable}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    id={mainTextareaId}
                    tabIndex={0}
                    data-testid="text-input"
                    rows={1}
                    onFocus={() => {
                      handleFocusOrClick();
                      setIsTextAreaFocused(true);
                    }}
                    onBlur={setIsTextAreaFocused.bind(null, false)}
                    onClick={handleFocusOrClick}
                    style={{ height: 44, overflowY: 'auto' }}
                    className={cn(
                      baseClasses,
                      removeFocusRings,
                      'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                    )}
                  />
                  <div className="flex flex-col items-start justify-start pt-1.5">
                    <CollapseChat
                      isCollapsed={isCollapsed}
                      isScrollable={isMoreThanThreeRows}
                      setIsCollapsed={setIsCollapsed}
                    />
                  </div>
                </div>
              )}
              <div
                className={cn(
                  'items-between flex gap-2 pb-2',
                  isRTL ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <AttachFileChat disableInputs={disableInputs} />
                </div>
                <BadgeRow
                  showEphemeralBadges={!isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)}
                  conversationId={conversationId}
                  onChange={setBadges}
                  isInChat={
                    Array.isArray(conversation?.messages) && conversation.messages.length >= 1
                  }
                />
                <div className="mx-auto flex" />
                {SpeechToText && (
                  <AudioRecorder
                    methods={methods}
                    ask={submitMessage}
                    textAreaRef={textAreaRef}
                    disabled={disableInputs || isNotAppendable}
                    isSubmitting={isSubmitting}
                  />
                )}
                <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                  {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                    <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                  ) : (
                    endpoint && (
                      <SendButton
                        ref={submitButtonRef}
                        control={methods.control}
                        disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
                      />
                    )
                  )}
                </div>
                <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                  <PhoneButton
                    disabled={disableInputs}
                    onClick={handlePhoneClick}
                  />
                </div>
              </div>
              {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
            </div>
          </div>
        </div>
      </form>
      {/* Widget de ElevenLabs ConvAI */}
      <div style={{ display: showElevenLabsWidget ? 'block' : 'none' }}>
        <elevenlabs-convai agent-id="agent_01jwaqh00re189x9avqywf2ah6"></elevenlabs-convai>
      </div>
    </>
  );
});

export default ChatForm;
