# Restaurar la base desde un respaldo

Esto es lo que hay que hacer el día malo. Los comandos de acá están
probados de punta a punta: volcar, cifrar, descifrar y restaurar en una base
vacía, comparando el conteo de las once tablas contra el original.

## Antes de empezar

Hacen falta dos cosas, y sin cualquiera de las dos no hay restauración:

1. **El archivo**, que vive en el volumen `respaldos` del servicio
   `atenmefa-respaldos` en el VPS.
2. **La clave de cifrado**, que está en la variable `CLAVE_RESPALDO` de ese
   mismo servicio, en Dokploy.

> Si se pierde la clave, los respaldos no sirven para nada. Convendría tener
> una copia donde no esté el servidor.

## Ver qué copias hay

En el VPS:

```sh
docker run --rm -v atenmefa-respaldos-jzep7q_respaldos:/r alpine \
  sh -c 'ls -lh /r/atenmefa-*.sql.gz.enc; echo; tail -5 /r/registro.txt'
```

Los archivos se llaman `atenmefa-AAAA-MM-DD-HHMM.sql.gz.enc` y se guardan
catorce días.

## Restaurar

Se restaura **en una base nueva**, nunca encima de la que está andando: si
el respaldo resulta estar incompleto, encima quedarían las dos cosas rotas.
Una vez que la nueva se ve bien, se cambia la aplicación para que apunte a
ella.

```sh
COPIA=atenmefa-2026-11-07-0700.sql.gz.enc
CLAVE_RESPALDO='<la de Dokploy>'
PGPASSWORD='<la de la base>'

# 1. Descifrar.
docker run --rm -e CLAVE_RESPALDO \
  -v atenmefa-respaldos-jzep7q_respaldos:/r -v /tmp:/salida \
  postgres:17-alpine sh -c "
    apk add --no-cache openssl >/dev/null
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
      -pass env:CLAVE_RESPALDO -in /r/$COPIA -out /salida/recuperado.dump"

# 2. Mirar qué trae, antes de tocar nada.
docker run --rm -v /tmp:/salida postgres:17-alpine \
  pg_restore --list /salida/recuperado.dump | head -30

# 3. Crear la base nueva y restaurar ahí.
docker run --rm --network dokploy-network -e PGPASSWORD postgres:17-alpine \
  psql -h atenmefa-base-aloysk -U atenmefa -d postgres \
  -c 'CREATE DATABASE atenmefa_recuperada'

docker run --rm --network dokploy-network -e PGPASSWORD \
  -v /tmp:/salida postgres:17-alpine \
  pg_restore -h atenmefa-base-aloysk -U atenmefa -d atenmefa_recuperada \
  --no-owner --no-privileges /salida/recuperado.dump
```

## Comprobar antes de cambiar nada

```sh
docker run --rm --network dokploy-network -e PGPASSWORD postgres:17-alpine \
  psql -h atenmefa-base-aloysk -U atenmefa -d atenmefa_recuperada -c "
    SELECT 'pacientes' t, count(*) FROM paciente
    UNION ALL SELECT 'atenciones', count(*) FROM atencion
    UNION ALL SELECT 'renglones',  count(*) FROM renglon
    UNION ALL SELECT 'cuentas',    count(*) FROM \"user\""
```

Si los números tienen sentido, recién ahí se le cambia `BASE_DATOS` a la
aplicación en Dokploy para que apunte a `atenmefa_recuperada` y se
redespliega.

## Borrar el archivo descifrado

El `.dump` de `/tmp` tiene las historias clínicas **sin cifrar**. Se borra
en cuanto termine la restauración:

```sh
rm -f /tmp/recuperado.dump
```

## Dos cosas que conviene saber

**pg_dump y el servidor tienen que ser de la misma versión mayor.** Todo
esto usa `postgres:17-alpine` porque el servidor es 17. Restaurar un volcado
de 17 en un servidor 16 da errores como
`unrecognized configuration parameter "transaction_timeout"`.

**Estas copias están en el mismo servidor que la base.** Sirven para
deshacer un borrado o una migración que salió mal, no para recuperarse de
perder la máquina. Para eso hace falta un destino fuera —R2, S3 o
similar— que Dokploy ya sabe usar: se agrega en Destinos y se le configura
un respaldo programado a la base.
