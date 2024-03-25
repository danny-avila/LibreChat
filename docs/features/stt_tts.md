# Speech to Text (STT) and Text to Speech (TTS)

## STT

The Speech-to-Text (STT) feature allows you to convert spoken words into written text. There are many different STT services available, but here's a list of some of the most popular ones:

### Local STT

- Browser-based
- Whisper (tested on localAI and HomeAssistant)

### Cloud STT

- OpenAI Whisper (via API calls)
- Azure Whisper (via API calls)
- All the other OpenAI compatible STT services


!!! info "NOTE"
    The Google cloud STT service is beeing planned to add in the future

### Browser-based

No setup required, just click make sure that the "STT button" in the speech settings tab is enabled. When clicking the button, the browser will ask for permission to use the microphone. Once permission is granted, you can start speaking and the text will be displayed in the chat window in real-time. When you're done speaking, click the button again to stop the transcription or wait for the timeout to stop the transcription automatically

### Whisper local

!!! info "NOTE"
    Whisper local has been tested only on localAI and HomeAssistant's whisper docker image, but it should work on any other local whisper instance

To use the Whisper local STT service, you need to have a local whisper instance running. You can find more information on how to set up a local whisper instance with LocalAI in the [LocalAI's documentation](https://localai.io/features/audio-to-text/). Once you have a local whisper instance running, you can configure the STT service as followed:

in the `librechat.yaml` add this configuration:

```yaml
stt:
  url: 'http://localhost:8080/v1/audio/transcriptions'
  apiKey: '${STT_API_KEY}'
  model: 'whisper-1'
```

where, the url it's the url of the whisper instance, the apiKey points to the .env (you need to use the .env necessarly), put a random string if (in the case of LocalAI) you don't have an api, and the model is the model that you want to use for the transcription.

in the `.env` file add a random string for the `STT_API_KEY` variable

!!! info "STT_API_KEY" 
    STT_API_KEY=sk-1234

### OpenAI Whisper

Create an OpenAI api key at [OpenAI's website](https://platform.openai.com/account/api-keys) and add it to the `.env` file as follows:

```
STT_API_KEY=sk-1234
```

Then, in the `librechat.yaml` file, add the following configuration:

```yaml
stt:
  url: 'https://api.openai.com/v1/audio/transcriptions'
  apiKey: '${STT_API_KEY}'
  model: 'whisper'
```

if you want to undestand more about these variables check the [Whisper local](#whisper-local) section

### Azure Whisper

Add a random string to the `STT_API_KEY` variable in the `.env` file:

```
STT_API_KEY=sk-1234
```

Then, in the `librechat.yaml` file, add the following configuration to your already existing Azure configuration:

??? info "don't have an Azure configuration yet?"
    if you don't have one, you can find more information on how to set up an Azure STT service in the [Azure's documentation](https://docs.librechat.ai/install/configuration/azure_openai.html)

```yaml
        models:
          whisper:
            deploymentName: whisper-01
```


Then, in the `librechat.yaml` file, add the following configuration:


if you want to undestand more about these variables check the [Whisper local](#whisper-local) section

### OpenAI compatible STT services

check the [OpenAI Whisper](#openai-whisper) section, just change the `url` and `model` variables to the ones that you want to use


## TTS

The Text-to-Speech (TTS) feature allows you to convert written text into spoken words. There are many different TTS services available, but here's a list of some of the most popular ones:

### Local TTS

- Browser-based
- Piper (tested on localAI)
- Coqui (tested on localAI)

### Cloud TTS

- OpenAI TTS
- ElevenLabs
- All the other OpenAI compatible TTS services

!!! info "NOTE"
    The Google cloud TTS service is beeing planned to add in the future

### Browser-based

No setup required, just click make sure that the "TTS button" in the speech settings tab is enabled. When clicking the button, it will start speaking, click the button again to stop the speech or wait for the speech to finish

### Piper

!!! info "NOTE"
    Piper has been tested only on localAI, but it should work on any other local piper instance

To use the Piper local TTS service, you need to have a local piper instance running. You can find more information on how to set up a local piper instance with LocalAI in the [LocalAI's documentation](https://localai.io/features/text-to-audio/#piper). Once you have a local piper instance running, you can configure the TTS service as followed:

in the `librechat.yaml` add this configuration:

```yaml
tts:
  url: 'http://localhost:8080/v1/audio/synthesize'
  apiKey: '${TTS_API_KEY}'
  model: 'piper'
```

where, the url it's the url of the piper instance, the apiKey points to the .env (you need to use the .env necessarly), put a random string if (in the case of LocalAI) you don't have an api, and the model is the model that you want to use for the synthesis.

!!! abstract "learn more about the variables"
    if you want to undestand more about these variables check the [ElevenLabs](#elevenlabs) section

in the `.env` file add a random string for the `TTS_API_KEY` variable

``
TTS_API_KEY=sk-1234
``

### Coqui

!!! info "NOTE"
    Coqui has been tested only on localAI, but it should work on any other local coqui instance

To use the Coqui local TTS service, you need to have a local coqui instance running. You can find more information on how to set up a local coqui instance with LocalAI in the [LocalAI's documentation](https://localai.io/features/text-to-audio/#-coqui). Once you have a local coqui instance running, you can configure the TTS service as followed:

in the `librechat.yaml` add this configuration:

```yaml
tts:
  url: 'http://localhost:8080/v1/audio/synthesize'
  apiKey: '${TTS_API_KEY}'
  model: 'coqui'
```

!!! abstract "learn more about the variables"
    if you want to undestand more about these variables check the [ElevenLabs](#elevenlabs) section

