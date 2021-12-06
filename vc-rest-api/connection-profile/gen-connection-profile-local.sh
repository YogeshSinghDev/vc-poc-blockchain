#!/bin/bash


#REPODIR points to this repo.
REPODIR=~/Documents/apps/vc-poc-blockchain

#CERTDIR points to the location of the fabric-samples repo. If you are using this to run Fabric, the crypto information
#would have been generated in the first-network/crypto-config folder.
CERTDIR=~/Documents/apps/fabric-samples

#copy the connection profiles
mkdir -p $REPODIR/tmp/connection-profile/org1
mkdir -p $REPODIR/tmp/connection-profile/org2
cp vc-connection-profile.yaml $REPODIR/tmp/connection-profile
cp client-org1.yaml $REPODIR/tmp/connection-profile/org1
cp client-org2.yaml $REPODIR/tmp/connection-profile/org2

#update the connection profiles to refer to the location of the Fabric crypto information
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -e "s|%REPODIR%|$CERTDIR|g" vc-connection-profile.yaml > $REPODIR/tmp/connection-profile/vc-connection-profile.yaml
else
    sed -i "s|%REPODIR%|$CERTDIR|g"  $REPODIR/tmp/connection-profile/vc-connection-profile.yaml
fi 

ls -lR $REPODIR/tmp/connection-profile