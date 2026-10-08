pub fn app_name() -> &'static str {
    "newpaper"
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_name_is_newpaper() {
        assert_eq!(super::app_name(), "newpaper");
    }
}