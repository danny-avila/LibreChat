



{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "librechat.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}


{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "librechat.fullname" -}}
{{- if $.Values.fullnameOverride }}
{{- $.Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "librechat.labels" -}}
helm.sh/chart: {{ include "librechat.chart" . }}
{{ include "librechat.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "librechat.selectorLabels" -}}
app.kubernetes.io/name: {{ include "librechat.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}


{{/*
RAG Selector labels
*/}}
{{- define "rag.selectorLabels" -}}
app.kubernetes.io/name: {{ include "librechat.fullname" . }}-rag
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "librechat.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "librechat.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Define apiVersion of HorizontalPodAutoscaler
*/}}
{{- define "librechat.hpa.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "autoscaling/v2" -}}
{{- print "autoscaling/v2" -}}
{{- else if .Capabilities.APIVersions.Has "autoscaling/v2beta2" -}}
{{- print "autoscaling/v2beta2" -}}
{{- else -}}
{{- print "autoscaling/v2beta1" -}}
{{- end -}}
{{- end -}}
