pipeline {
    agent {
        kubernetes {
            cloud "k8s-agents"
            serviceAccount "jenkins-k8s-jobs"
            yaml """
                apiVersion: v1
                kind: Pod
                metadata:
                  labels:
                    service: checkout-service
                spec:
                  containers:
                  - name: branch-verification
                    image: 223287545160.dkr.ecr.us-east-2.amazonaws.com/alpine:latest
                    command:
                    - cat
                    tty: true
                    imagePullPolicy: Always
                  - name: title-verification
                    image: 223287545160.dkr.ecr.us-east-2.amazonaws.com/devops:github-pr-title
                    command:
                    - cat
                    tty: true
                    imagePullPolicy: Always
                """
            retries 2
        }
    }
    environment {
        GITHUB = credentials('devops-getbalance-github-repo-token')
        REPO_NAME = 'BAI'
    }
    stages {
        stage('Semantic-checks') {
            parallel {
                stage('branch-verification') {
                    steps {
                        container('branch-verification') {
                            script {
                                branchVerification()
                            }
                        }
                    }
                }
                stage('title-verification') {
                    steps {
                        container('title-verification') {
                            script {
                                titleVerification(repo_name="${REPO_NAME}")
                            }
                        }
                    }
                }
            }
        }
    }
}
