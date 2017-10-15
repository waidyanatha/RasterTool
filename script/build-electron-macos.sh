#!/bin/sh

VERSION=1.7.9

CreateLanguageVersion()
{
	LANG=$1
	BUILDDIR=build/standalone/$LANG
	BASEDIR=build/electron-v$VERSION-darwin-x64-$LANG
	APPDIR=$BASEDIR/Electron.app/Contents/Resources/app

	echo "Building $LANG version for MacOS..."

	script/lint/jsl -nologo -nosummary -conf script/lint/jsl.default.conf -process standalone/main.js || exit 1

	if [ ! -d $BUILDDIR ]; then
		echo "Build directory $BUILDDIR does not exist." && exit 1
	fi

	if [ -d $BASEDIR ]
	then
		rm -fr $APPDIR
	else
		mkdir -p $BASEDIR
		( cd $BASEDIR && unzip ../../electron-v$VERSION-darwin-x64.zip )
		xattr -d com.apple.quarantine $BASEDIR/Electron.app
	fi

	mkdir $APPDIR
	mkdir $APPDIR/js
	mkdir $APPDIR/img
	mkdir $APPDIR/help
	mkdir $APPDIR/app

	cp -R -p $BUILDDIR/* $APPDIR
	cp -p standalone/* $APPDIR
	#mv $APPDIR/standalone.html $APPDIR/index.html

	echo "...done."
}

CreateLanguageVersion "EN"
CreateLanguageVersion "NL"
