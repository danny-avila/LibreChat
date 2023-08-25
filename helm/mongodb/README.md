# mongodb helm

Mongo is deployed using custom K8s Operator.

https://github.com/mongodb/helm-charts/tree/main/charts/community-operator

## deploying

`helm repo add mongodb https://mongodb.github.io/helm-charts`

`helm install community-operator mongodb/community-operator --namespace mongodb --create-namespace`

the above only creates the oeprator.
to create a database, apply the example spec file

`k appyl -f mongodb.com_v1_mongodbcommunity_cr.yaml -n mongodb`