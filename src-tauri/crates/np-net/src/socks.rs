//! SOCKS5 (RFC 1928), lado servidor, solo CONNECT y sin autenticación.

use std::{
    fmt,
    io,
    net::{Ipv4Addr, Ipv6Addr, SocketAddr},
};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub mod reply {
    pub const SUCCEEDED: u8 = 0x00;
    pub const GENERAL_FAILURE: u8 = 0x01;
    pub const NOT_ALLOWED: u8 = 0x02;
    pub const NETWORK_UNREACHABLE: u8 = 0x03;
    pub const HOST_UNREACHABLE: u8 = 0x04;
    pub const CONNECTION_REFUSED: u8 = 0x05;
    pub const COMMAND_NOT_SUPPORTED: u8 = 0x07;
    pub const ADDRESS_NOT_SUPPORTED: u8 = 0x08;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetAddr {
    Domain(String, u16),
    Ip(SocketAddr),
}

impl TargetAddr {
    pub fn host(&self) -> String {
        match self {
            TargetAddr::Domain(h, _) => h.clone(),
            TargetAddr::Ip(sa) => sa.ip().to_string(),
        }
    }
    pub fn port(&self) -> u16 {
        match self {
            TargetAddr::Domain(_, p) => *p,
            TargetAddr::Ip(sa) => sa.port(),
        }
    }
}

impl fmt::Display for TargetAddr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TargetAddr::Domain(h, p) => write!(f, "{h}:{p}"),
            TargetAddr::Ip(sa) => write!(f, "{sa}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SocksError {
    #[error("unsupported SOCKS version {0}")]
    Version(u8),
    #[error("no acceptable authentication method")]
    NoAcceptableAuth,
    #[error("unsupported command {0}")]
    Command(u8),
    #[error("unsupported address type {0}")]
    AddrType(u8),
    #[error("invalid domain name")]
    Domain,
    #[error("io: {0}")]
    Io(String),
}

impl From<io::Error> for SocksError {
    fn from(e: io::Error) -> Self {
        SocksError::Io(e.to_string())
    }
}

pub async fn negotiate<S: AsyncRead + AsyncWrite + Unpin>(s: &mut S) -> Result<(), SocksError> {
    let ver = s.read_u8().await?;
    if ver != 5 {
        return Err(SocksError::Version(ver));
    }
    let n = s.read_u8().await? as usize;
    let mut methods = vec![0u8; n];
    s.read_exact(&mut methods).await?;
    if methods.contains(&0x00) {
        s.write_all(&[5, 0x00]).await?;
        Ok(())
    } else {
        s.write_all(&[5, 0xFF]).await?;
        Err(SocksError::NoAcceptableAuth)
    }
}

pub async fn write_reply<S: AsyncWrite + Unpin>(s: &mut S, code: u8) -> io::Result<()> {
    s.write_all(&[5, code, 0, 1, 0, 0, 0, 0, 0, 0]).await
}

pub async fn read_request<S: AsyncRead + AsyncWrite + Unpin>(s: &mut S) -> Result<TargetAddr, SocksError> {
    let mut head = [0u8; 4];
    s.read_exact(&mut head).await?;
    if head[0] != 5 {
        return Err(SocksError::Version(head[0]));
    }
    if head[1] != 0x01 {
        write_reply(s, reply::COMMAND_NOT_SUPPORTED).await?;
        return Err(SocksError::Command(head[1]));
    }
    let target = match head[3] {
        0x01 => {
            let mut ip = [0u8; 4];
            s.read_exact(&mut ip).await?;
            let port = s.read_u16().await?;
            TargetAddr::Ip(SocketAddr::from((Ipv4Addr::from(ip), port)))
        }
        0x03 => {
            let len = s.read_u8().await? as usize;
            let mut name = vec![0u8; len];
            s.read_exact(&mut name).await?;
            let port = s.read_u16().await?;
            let name = String::from_utf8(name).map_err(|_| SocksError::Domain)?;
            if name.is_empty() || name.contains(['\0', '/', ' ']) {
                write_reply(s, reply::GENERAL_FAILURE).await?;
                return Err(SocksError::Domain);
            }
            TargetAddr::Domain(name, port)
        }
        0x04 => {
            let mut ip = [0u8; 16];
            s.read_exact(&mut ip).await?;
            let port = s.read_u16().await?;
            TargetAddr::Ip(SocketAddr::from((Ipv6Addr::from(ip), port)))
        }
        other => {
            write_reply(s, reply::ADDRESS_NOT_SUPPORTED).await?;
            return Err(SocksError::AddrType(other));
        }
    };
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{duplex, AsyncReadExt, AsyncWriteExt};

    async fn server_side(client_bytes: Vec<u8>) -> (Result<TargetAddr, SocksError>, Vec<u8>) {
        let (mut client, mut server) = duplex(1024);
        client.write_all(&client_bytes).await.unwrap();
        let res = async {
            negotiate(&mut server).await?;
            read_request(&mut server).await
        }
        .await;
        drop(server);
        let mut out = Vec::new();
        client.read_to_end(&mut out).await.unwrap();
        (res, out)
    }

    #[tokio::test]
    async fn parses_domain_connect_without_resolving() {
        let mut req = vec![5, 1, 0, 5, 1, 0, 3, 10];
        req.extend_from_slice(b"elpais.com");
        req.extend_from_slice(&443u16.to_be_bytes());
        let (res, out) = server_side(req).await;
        assert_eq!(res.unwrap(), TargetAddr::Domain("elpais.com".into(), 443));
        assert_eq!(out, vec![5, 0]);
    }

    #[tokio::test]
    async fn parses_ipv4_and_ipv6() {
        let mut v4 = vec![5, 1, 0, 5, 1, 0, 1, 93, 184, 216, 34];
        v4.extend_from_slice(&80u16.to_be_bytes());
        assert_eq!(server_side(v4).await.0.unwrap().to_string(), "93.184.216.34:80");
        let mut v6 = vec![5, 1, 0, 5, 1, 0, 4];
        v6.extend_from_slice(&std::net::Ipv6Addr::LOCALHOST.octets());
        v6.extend_from_slice(&8080u16.to_be_bytes());
        assert_eq!(server_side(v6).await.0.unwrap().to_string(), "[::1]:8080");
    }

    #[tokio::test]
    async fn rejects_auth_only_clients() {
        let (res, out) = server_side(vec![5, 1, 2]).await;
        assert_eq!(res.unwrap_err(), SocksError::NoAcceptableAuth);
        assert_eq!(out, vec![5, 0xFF]);
    }

    #[tokio::test]
    async fn rejects_bind_and_udp_commands() {
        let mut req = vec![5, 1, 0, 5, 2, 0, 1, 1, 2, 3, 4];
        req.extend_from_slice(&80u16.to_be_bytes());
        let (res, out) = server_side(req).await;
        assert_eq!(res.unwrap_err(), SocksError::Command(2));
        assert_eq!(&out[2..4], &[5, reply::COMMAND_NOT_SUPPORTED]);
    }

    #[tokio::test]
    async fn rejects_socks4_and_empty_domains() {
        assert_eq!(server_side(vec![4, 1, 0]).await.0.unwrap_err(), SocksError::Version(4));
        let mut req = vec![5, 1, 0, 5, 1, 0, 3, 0];
        req.extend_from_slice(&80u16.to_be_bytes());
        assert_eq!(server_side(req).await.0.unwrap_err(), SocksError::Domain);
    }
}
